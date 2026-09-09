import { HttpError } from "@/lib/api"
import {
  bearerFrom,
  createSession,
  destroySession,
  getSessionUser,
} from "@/lib/auth"
import { prisma } from "@/lib/db"
import { columnMeta, PROJECT_COLORS } from "@/lib/types"
import { createTicket, patchTicket } from "./tickets"

function projectTokenFrom(req: Request) {
  const url = new URL(req.url)
  return (
    req.headers.get("x-tesuto-project") ??
    url.searchParams.get("token") ??
    ""
  ).trim()
}

/** Resolve the project from its token, or 401 with a clear message. */
export async function widgetProject(req: Request) {
  const token = projectTokenFrom(req)
  if (!token) throw new HttpError("Missing project token", 401)
  const project = await prisma.project.findUnique({ where: { token } })
  if (!project) throw new HttpError("That project token isn't recognised", 401)
  return project
}

/**
 * Widget requests carry two credentials: the project token (which board) as the
 * `X-Tesuto-Project` header or `?token=`, and the signed-in user's bearer token
 * (who) as `Authorization: Bearer`.
 */
export async function widgetAuth(req: Request) {
  const [user, project] = await Promise.all([
    getSessionUser(req),
    widgetProject(req),
  ])
  if (!user) throw new HttpError("Sign in to continue", 401)
  return { user, project }
}

/** Public: validate the token + surface the project name for the sign-in screen. */
export async function widgetProjectInfo(req: Request) {
  const p = await widgetProject(req)
  return { id: p.id, key: p.key, name: p.name }
}

/** Name+email sign-in scoped to a widget (validates the project token too). */
export async function widgetSignIn(
  req: Request,
  input: { name: string; email: string },
) {
  await widgetProject(req)
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const count = await prisma.user.count()
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      name,
      email,
      role: "member",
      color: PROJECT_COLORS[count % PROJECT_COLORS.length],
      active: true,
    },
    update: { name },
  })
  const token = await createSession(user.id)
  return { user: { id: user.id, name: user.name, color: user.color }, token }
}

export async function widgetSignOut(req: Request) {
  await destroySession(bearerFrom(req))
  return { ok: true }
}

export async function widgetBootstrap(req: Request) {
  const { user, project } = await widgetAuth(req)
  const columns = await prisma.column.findMany({ orderBy: { order: "asc" } })
  return {
    project: { id: project.id, key: project.key, name: project.name },
    user: { id: user.id, name: user.name, color: user.color },
    columns: columns.map((c) => ({
      id: c.id,
      label: c.label,
      dot: c.dot,
      terminal: c.terminal,
    })),
  }
}

type ListRow = {
  id: string
  key: string
  title: string
  status: string
  priority: string
  createdAt: Date
  sourceUrl: string | null
  reporter: string
  comments: number
}

export async function widgetIssues(
  req: Request,
  opts: { scope: "page" | "all"; url?: string },
) {
  const { project } = await widgetAuth(req)
  const rows = await prisma.ticket.findMany({
    where: {
      projectId: project.id,
      ...(opts.scope === "page" && opts.url ? { sourceUrl: opts.url } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      key: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
      sourceUrl: true,
      reporter: { select: { name: true } },
      _count: { select: { comments: true } },
    },
  })
  return rows.map(
    (r): ListRow => ({
      id: r.id,
      key: r.key,
      title: r.title,
      status: r.status,
      priority: r.priority,
      createdAt: r.createdAt,
      sourceUrl: r.sourceUrl,
      reporter: r.reporter.name,
      comments: r._count.comments,
    }),
  )
}

export async function widgetIssue(req: Request, id: string) {
  const { project } = await widgetAuth(req)
  const t = await prisma.ticket.findUnique({
    where: { id },
    include: { reporter: { select: { name: true, color: true } } },
  })
  if (!t || t.projectId !== project.id) {
    throw new HttpError("Issue not found", 404)
  }
  return {
    id: t.id,
    key: t.key,
    title: t.title,
    description: t.description,
    status: t.status,
    statusLabel: columnMeta(t.status).label,
    priority: t.priority,
    type: t.type,
    sourceUrl: t.sourceUrl,
    screenshotUrl: t.screenshotUrl,
    domSnapshot: t.domSnapshot,
    createdAt: t.createdAt,
    reporter: t.reporter,
  }
}

export async function widgetComments(req: Request, id: string) {
  const { project } = await widgetAuth(req)
  const t = await prisma.ticket.findUnique({
    where: { id },
    select: { projectId: true },
  })
  if (!t || t.projectId !== project.id) {
    throw new HttpError("Issue not found", 404)
  }
  const rows = await prisma.comment.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, color: true } } },
  })
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    author: c.author,
  }))
}

async function assertInProject(id: string, projectId: string) {
  const t = await prisma.ticket.findUnique({
    where: { id },
    select: { projectId: true },
  })
  if (!t || t.projectId !== projectId) {
    throw new HttpError("Issue not found", 404)
  }
}

export async function widgetAddComment(req: Request, id: string, body: string) {
  const { user, project } = await widgetAuth(req)
  await assertInProject(id, project.id)
  const c = await prisma.comment.create({
    data: { ticketId: id, authorId: user.id, body },
    include: { author: { select: { id: true, name: true, color: true } } },
  })
  return { id: c.id, body: c.body, createdAt: c.createdAt, author: c.author }
}

export async function widgetPatchIssue(
  req: Request,
  id: string,
  patch: { priority?: string; status?: string },
) {
  const { user, project } = await widgetAuth(req)
  await assertInProject(id, project.id)
  const t = await patchTicket(id, patch, user.id)
  return { id: t.id, status: t.status, priority: t.priority }
}

export type WidgetCreateInput = {
  title: string
  description?: string
  priority: string
  sourceUrl?: string
  screenshot?: string
  domSnapshot?: unknown
  context?: unknown
}

export async function widgetCreateIssue(
  req: Request,
  input: WidgetCreateInput,
) {
  const { user, project } = await widgetAuth(req)
  const ticket = await createTicket(
    {
      title: input.title,
      description: input.description,
      projectId: project.id,
      priority: input.priority,
      type: "bug",
      sourceUrl: input.sourceUrl,
      screenshotUrl: input.screenshot,
      domSnapshot: input.domSnapshot,
      context: input.context,
    },
    user.id,
  )
  return { id: ticket.id, key: ticket.key, title: ticket.title }
}
