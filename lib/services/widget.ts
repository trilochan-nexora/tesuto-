import { createHash, randomInt, timingSafeEqual } from "node:crypto"
import { HttpError } from "@/lib/api"
import { verifyAssertion } from "@/lib/assertion"
import {
  bearerFrom,
  createSession,
  destroySession,
  getSessionUser,
} from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendEmail } from "@/lib/notify"
import { columnMeta, PROJECT_COLORS } from "@/lib/types"
import { addComment } from "./comments"
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

const WIDGET_USER_ID = "widget"

/** Shared secret with the host app. Unset = legacy trusted-host dev mode. */
export function widgetSecret() {
  return process.env.TESUTO_WIDGET_SECRET?.trim() || ""
}

function verifiedHostEmail(assertion: unknown): string {
  const secret = widgetSecret()
  if (!secret)
    throw new HttpError("Identity verification is not configured", 500)
  const payload = verifyAssertion(assertion, secret)
  if (!payload)
    throw new HttpError("That sign-in proof is invalid or expired", 401)
  return payload.email.trim().toLowerCase()
}

type WidgetSessionUser = { id: string; name: string; color: string }

export type WidgetAuthResult =
  | { linked: true; user: WidgetSessionUser; token: string }
  | { linked: false; hostEmail: string }

/**
 * Mints a widget session.
 *
 * Verified mode (TESUTO_WIDGET_SECRET set): the host proves its user with a
 * signed assertion. A remembered host→user link signs straight in; otherwise
 * the caller gets `{ linked: false }` and must run the link flow first —
 * nobody comments until their Tesuto identity is proven.
 *
 * Legacy mode (no secret): the host's `{ name, email }` claim is trusted as
 * before — local dev only.
 */
export async function widgetSignIn(
  req: Request,
  input: { assertion?: string; name?: string; email?: string },
): Promise<WidgetAuthResult> {
  await widgetProject(req)

  if (widgetSecret()) {
    if (!input.assertion) {
      throw new HttpError("A verified Hearth sign-in is required", 401)
    }
    const hostEmail = verifiedHostEmail(input.assertion)
    const link = await prisma.widgetLink.findUnique({
      where: { hostEmail },
      include: { user: { select: { id: true, name: true, color: true } } },
    })
    if (!link?.verifiedAt) return { linked: false, hostEmail }
    const token = await createSession(link.user.id)
    return { linked: true, user: link.user, token }
  }

  const email = input.email?.trim().toLowerCase()
  const name = input.name?.trim()

  let user: { id: string; name: string; color: string }
  if (email && name) {
    const count = await prisma.user.count()
    user = await prisma.user.upsert({
      where: { email },
      create: {
        name,
        email,
        role: "member",
        color: PROJECT_COLORS[count % PROJECT_COLORS.length],
        active: true,
      },
      update: { name },
      select: { id: true, name: true, color: true },
    })
  } else {
    user = await prisma.user.upsert({
      where: { id: WIDGET_USER_ID },
      create: {
        id: WIDGET_USER_ID,
        name: "Widget",
        email: "widget@tesuto.local",
        color: "#71717a",
        role: "member",
        active: false,
      },
      update: {},
      select: { id: true, name: true, color: true },
    })
  }
  const token = await createSession(user.id)
  return { user, token, linked: true }
}

export async function widgetSignOut(req: Request) {
  await destroySession(bearerFrom(req))
  return { ok: true }
}

const LINK_CODE_TTL_MS = 10 * 60 * 1000
const LINK_RESEND_WAIT_MS = 60 * 1000
const LINK_MAX_ATTEMPTS = 5

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex")
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@")
  if (!domain) return email
  const head = (local ?? "").slice(0, 2)
  return `${head}•••@${domain}`
}

/**
 * Step 1 of linking: the proven host user claims a Tesuto email; we mail
 * them a 6-digit code. Resends are throttled; each send resets the code.
 */
export async function startLink(input: { assertion?: string; email?: string }) {
  const hostEmail = verifiedHostEmail(input.assertion)
  const email = input.email?.trim().toLowerCase()
  if (!email) throw new HttpError("Email is required", 400)
  const target = await prisma.user.findUnique({
    where: { email },
    select: { id: true, active: true },
  })
  if (!target?.active) {
    throw new HttpError(
      "No active Tesuto account uses that email — ask your admin to add you first",
      404,
    )
  }
  const existing = await prisma.widgetLink.findUnique({ where: { hostEmail } })
  if (
    existing?.lastSentAt &&
    Date.now() - existing.lastSentAt.getTime() < LINK_RESEND_WAIT_MS
  ) {
    throw new HttpError("A code was just sent — wait a minute to resend", 429)
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  await prisma.widgetLink.upsert({
    where: { hostEmail },
    create: {
      hostEmail,
      userId: target.id,
      codeHash: hashCode(code),
      codeExpiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
      attempts: 0,
      lastSentAt: new Date(),
      verifiedAt: null,
    },
    update: {
      userId: target.id,
      codeHash: hashCode(code),
      codeExpiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
      attempts: 0,
      lastSentAt: new Date(),
      verifiedAt: null,
    },
  })
  await sendEmail(
    email,
    "Your Tesuto link code",
    `<p>Your Tesuto verification code is: <strong style="font-size:20px;letter-spacing:4px">${code}</strong></p><p>It expires in 10 minutes. If you didn't request this, ignore the email.</p>`,
  )
  return { ok: true as const, email: maskEmail(email) }
}

/**
 * Step 2 of linking: the code proves ownership of the Tesuto email, so the
 * host identity is permanently linked to that user and signed straight in.
 */
export async function verifyLink(input: {
  assertion?: string
  email?: string
  code?: string
}): Promise<WidgetAuthResult> {
  const hostEmail = verifiedHostEmail(input.assertion)
  const email = input.email?.trim().toLowerCase()
  if (!email || !input.code)
    throw new HttpError("Email and code are required", 400)
  const row = await prisma.widgetLink.findUnique({
    where: { hostEmail },
    include: { user: { select: { id: true, name: true, color: true } } },
  })
  async function bumpAttempts() {
    await prisma.widgetLink.update({
      where: { hostEmail },
      data: { attempts: { increment: 1 } },
    })
  }
  if (!row?.codeHash || !row?.codeExpiresAt) {
    throw new HttpError("No pending code — request one first", 400)
  }
  if (row.codeExpiresAt.getTime() < Date.now()) {
    await prisma.widgetLink.update({
      where: { hostEmail },
      data: { codeHash: null, codeExpiresAt: null },
    })
    throw new HttpError("That code expired — request a new one", 400)
  }
  if (row.attempts >= LINK_MAX_ATTEMPTS) {
    await prisma.widgetLink.update({
      where: { hostEmail },
      data: { codeHash: null, codeExpiresAt: null },
    })
    throw new HttpError("Too many tries — request a new code", 429)
  }
  const want = Buffer.from(row.codeHash)
  const got = Buffer.from(hashCode(input.code.trim()))
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    await bumpAttempts()
    throw new HttpError("That code doesn't match — try again", 400)
  }
  const target = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, color: true, active: true },
  })
  if (!target?.active || target?.id !== row.userId) {
    await bumpAttempts()
    throw new HttpError("That code wasn't issued for this email", 400)
  }
  await prisma.widgetLink.update({
    where: { hostEmail },
    data: {
      verifiedAt: new Date(),
      codeHash: null,
      codeExpiresAt: null,
      attempts: 0,
    },
  })
  const token = await createSession(target.id)
  return {
    linked: true,
    user: { id: target.id, name: target.name, color: target.color },
    token,
  }
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
  const { user, project } = await widgetAuth(req)
  const rows = await prisma.ticket.findMany({
    where: {
      projectId: project.id,
      ...(opts.scope === "page" && opts.url ? { sourceUrl: opts.url } : {}),
      // "All" is the viewer's own queue: only tickets assigned to them.
      // Page scope stays unfiltered — triage needs the full page picture.
      ...(opts.scope === "all" ? { assigneeId: user.id } : {}),
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
    recordingUrl: t.recordingUrl,
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
  const c = await addComment(id, body, user.id)
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    author: { id: user.id, name: user.name, color: user.color },
  }
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
  recording?: string
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
      recordingUrl: input.recording,
      domSnapshot: input.domSnapshot,
      context: input.context,
    },
    user.id,
  )
  return { id: ticket.id, key: ticket.key, title: ticket.title }
}
