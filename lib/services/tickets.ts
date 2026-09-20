import { HttpError } from "@/lib/api"
import { decryptToken } from "@/lib/crypto"
import { prisma } from "@/lib/db"
import { appUrl } from "@/lib/env"
import { createGithubIssue } from "@/lib/github"
import {
  type NotifyTicket,
  notifyTicketAssigned,
  notifyTicketCreated,
  notifyTicketResolved,
  notifyTicketUnassigned,
} from "@/lib/notify"
import type { TicketEvent } from "@/lib/types"
import { DEFAULT_COLUMNS } from "@/lib/types"
import { Prisma } from "@/prisma/generated/client"
import { getSetting } from "./settings"

function nextKey(projectKey: string, keys: string[]) {
  const nums = keys
    .filter((k) => k.startsWith(`${projectKey}-`))
    .map((k) => Number.parseInt(k.split("-")[1] ?? "0", 10))
  const max = nums.length ? Math.max(...nums) : 0
  return `${projectKey}-${max + 1}`
}

async function isTerminal(status: string) {
  const col = await prisma.column.findUnique({ where: { id: status } })
  if (col) return col.terminal
  return DEFAULT_COLUMNS.find((c) => c.id === status)?.terminal ?? false
}

async function statusLabel(status: string) {
  const col = await prisma.column.findUnique({ where: { id: status } })
  return (
    col?.label ?? DEFAULT_COLUMNS.find((c) => c.id === status)?.label ?? status
  )
}

/** Slim ticket view the notifier needs (project name/key ride along). */
function toNotifyTicket(
  ticket: {
    id: string
    key: string
    title: string
    priority: string
    sourceUrl: string | null
    assigneeId: string | null
  },
  project: { name: string; key: string } | null,
): NotifyTicket {
  return {
    id: ticket.id,
    key: ticket.key,
    title: ticket.title,
    priority: ticket.priority,
    sourceUrl: ticket.sourceUrl,
    assigneeId: ticket.assigneeId,
    project: project ? { name: project.name, key: project.key } : null,
  }
}

export type TicketFilters = {
  projectId?: string
  status?: string
  assigneeId?: string
  parentId?: string
}

export function listTickets(filters: TicketFilters = {}) {
  return prisma.ticket.findMany({
    where: {
      projectId: filters.projectId,
      status: filters.status,
      assigneeId: filters.assigneeId,
      parentId: filters.parentId,
    },
    orderBy: { order: "asc" },
  })
}

export async function getTicket(id: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id } })
  if (!ticket) throw new HttpError("Ticket not found", 404)
  return ticket
}

export function childrenOf(parentId: string) {
  return prisma.ticket.findMany({
    where: { parentId },
    orderBy: { createdAt: "asc" },
  })
}

export type NewTicketInput = {
  title: string
  description?: string
  projectId: string
  priority: string
  type: string
  assigneeId?: string
  parentId?: string
  status?: string
  sourceUrl?: string
  screenshotUrl?: string
  recordingUrl?: string
  annotations?: unknown
  domSnapshot?: unknown
  context?: unknown
}

export async function createTicket(input: NewTicketInput, actorId: string) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
  })
  if (!project) throw new HttpError("Project not found", 404)

  const iso = new Date()
  const status = input.status ?? "backlog"
  const events: TicketEvent[] = [
    { at: iso.toISOString(), kind: "created", actorId },
  ]
  if (input.assigneeId) {
    events.push({
      at: iso.toISOString(),
      kind: "assigned",
      actorId,
      to: input.assigneeId,
    })
  }

  const data = {
    projectId: project.id,
    title: input.title,
    description: input.description || null,
    status,
    priority: input.priority,
    type: input.type,
    reporterId: actorId,
    assigneeId: input.assigneeId ?? null,
    assignedAt: input.assigneeId ? iso : null,
    parentId: input.parentId ?? null,
    sourceUrl: input.sourceUrl ?? null,
    screenshotUrl: input.screenshotUrl ?? null,
    recordingUrl: input.recordingUrl ?? null,
    annotations: (input.annotations ?? undefined) as Prisma.InputJsonValue,
    domSnapshot: (input.domSnapshot ?? undefined) as Prisma.InputJsonValue,
    context: (input.context ?? undefined) as Prisma.InputJsonValue,
    resolvedAt: (await isTerminal(status)) ? iso : null,
    order: -Date.now(),
    events: events as unknown as Prisma.InputJsonValue,
  }

  // key generation can race two concurrent creates for the same project;
  // @@unique([projectId, key]) rejects the loser, so retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const keys = await prisma.ticket.findMany({
      where: { projectId: project.id },
      select: { key: true },
    })
    try {
      const ticket = await prisma.ticket.create({
        data: {
          ...data,
          key: nextKey(
            project.key,
            keys.map((k) => k.key),
          ),
        },
      })
      notifyTicketCreated(
        {
          id: ticket.id,
          key: ticket.key,
          title: ticket.title,
          priority: ticket.priority,
          sourceUrl: ticket.sourceUrl,
          assigneeId: ticket.assigneeId,
          project: { name: project.name, key: project.key },
        },
        actorId,
      )
      return ticket
    } catch (err) {
      if (attempt === 0 && (err as { code?: string }).code === "P2002") {
        continue
      }
      throw err
    }
  }
  throw new HttpError("Could not allocate a ticket key", 409)
}

export type TicketPatch = {
  title?: string
  description?: string | null
  status?: string
  priority?: string
  type?: string
  assigneeId?: string | null
  order?: number
  parentId?: string | null
  githubIssueUrl?: string | null
  annotations?: unknown
}

export async function patchTicket(
  id: string,
  patch: TicketPatch,
  actorId: string,
) {
  const current = await prisma.ticket.findUnique({
    where: { id },
    include: { project: true },
  })
  if (!current) throw new HttpError("Ticket not found", 404)

  const iso = new Date()
  const events = [...((current.events as unknown as TicketEvent[]) ?? [])]
  const data: Prisma.TicketUpdateInput = {}

  if (patch.title !== undefined) data.title = patch.title
  if (patch.description !== undefined) data.description = patch.description
  if (patch.priority !== undefined) data.priority = patch.priority
  if (patch.type !== undefined) data.type = patch.type
  if (patch.order !== undefined) data.order = patch.order
  if (patch.githubIssueUrl !== undefined)
    data.githubIssueUrl = patch.githubIssueUrl
  if (patch.annotations !== undefined) {
    data.annotations =
      patch.annotations === null
        ? Prisma.JsonNull
        : (patch.annotations as Prisma.InputJsonValue)
  }
  if (patch.parentId !== undefined) {
    data.parent = patch.parentId
      ? { connect: { id: patch.parentId } }
      : { disconnect: true }
  }

  let assignedTo: string | null = null
  let unassignedFrom: string | null = null
  let resolvedInto: string | null = null

  if ("assigneeId" in patch && patch.assigneeId !== current.assigneeId) {
    if (patch.assigneeId) {
      data.assignee = { connect: { id: patch.assigneeId } }
      events.push({
        at: iso.toISOString(),
        kind: "assigned",
        actorId,
        from: current.assigneeId ?? undefined,
        to: patch.assigneeId,
      })
      if (!current.assignedAt) data.assignedAt = iso
      assignedTo = patch.assigneeId
    } else {
      data.assignee = { disconnect: true }
      events.push({
        at: iso.toISOString(),
        kind: "unassigned",
        actorId,
        from: current.assigneeId ?? undefined,
      })
      unassignedFrom = current.assigneeId ?? null
    }
  }

  if (patch.status !== undefined && patch.status !== current.status) {
    data.status = patch.status
    events.push({
      at: iso.toISOString(),
      kind: "status",
      actorId,
      from: current.status,
      to: patch.status,
    })
    data.resolvedAt = (await isTerminal(patch.status)) ? iso : null
    if (await isTerminal(patch.status)) resolvedInto = patch.status
  }

  data.events = events as unknown as Prisma.InputJsonValue
  const updated = await prisma.ticket.update({ where: { id }, data })

  void sendPatchNotifications({
    ticket: updated,
    project: current.project,
    actorId,
    assignedTo,
    unassignedFrom,
    resolvedInto,
  })

  return updated
}

async function sendPatchNotifications(input: {
  ticket: {
    id: string
    key: string
    title: string
    priority: string
    sourceUrl: string | null
    assigneeId: string | null
  }
  project: { name: string; key: string } | null
  actorId: string
  assignedTo: string | null
  unassignedFrom: string | null
  resolvedInto: string | null
}) {
  const { ticket, project } = input
  const base = toNotifyTicket(ticket, project)
  if (input.resolvedInto) {
    const label = await statusLabel(input.resolvedInto)
    notifyTicketResolved(base, label, input.actorId)
  }
  if (input.assignedTo) {
    const assignee = await prisma.user.findUnique({
      where: { id: input.assignedTo },
      select: { name: true },
    })
    notifyTicketAssigned(base, assignee?.name ?? "a teammate", input.actorId)
  }
  if (input.unassignedFrom) {
    const previous = await prisma.user.findUnique({
      where: { id: input.unassignedFrom },
      select: { name: true },
    })
    notifyTicketUnassigned(base, previous?.name ?? "a teammate", input.actorId)
  }
}

export async function bulkMove(ids: string[], status: string, actorId: string) {
  const terminal = await isTerminal(status)
  const iso = new Date()
  const rows = await prisma.ticket.findMany({
    where: { id: { in: ids } },
  })
  await prisma.$transaction(
    rows.map((t) => {
      const events = [...((t.events as unknown as TicketEvent[]) ?? [])]
      if (t.status !== status) {
        events.push({
          at: iso.toISOString(),
          kind: "status",
          actorId,
          from: t.status,
          to: status,
        })
      }
      return prisma.ticket.update({
        where: { id: t.id },
        data: {
          status,
          resolvedAt: terminal ? (t.resolvedAt ?? iso) : null,
          events: events as unknown as Prisma.InputJsonValue,
        },
      })
    }),
  )
  return { moved: rows.length }
}

export async function deleteTickets(ids: string[]) {
  const { count } = await prisma.ticket.deleteMany({
    where: { id: { in: ids } },
  })
  return { deleted: count }
}

function issueBody(ticket: {
  id: string
  key: string
  title: string
  description: string | null
  sourceUrl: string | null
}) {
  const parts: string[] = []
  if (ticket.description?.trim()) parts.push(ticket.description.trim())
  const context: string[] = []
  if (ticket.sourceUrl) context.push(`Reported from: ${ticket.sourceUrl}`)
  context.push(`Tesuto ticket: ${appUrl()}/tickets/${ticket.id}`)
  parts.push(`<!-- tesuto -->\n${context.join("\n")}`)
  return parts.join("\n\n")
}

/**
 * The real GitHub sync: the acting user must have connected via OAuth
 * (Settings → Connections) and the project must name a repo. Creates an
 * issue under the user's own account and stores the link on the ticket.
 * The board stays the source of truth — no two-way sync.
 */
export async function syncTicketToGithub(id: string, actorId: string) {
  const [user, ticket] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorId },
      select: { githubConnected: true, githubToken: true },
    }),
    prisma.ticket.findUnique({
      where: { id },
      include: { project: true },
    }),
  ])
  if (!ticket) throw new HttpError("Ticket not found", 404)

  if (!(await getSetting("integration.github_sync"))) {
    throw new HttpError(
      "GitHub sync is disabled — enable it in Settings → Integrations",
      403,
    )
  }

  if (!user?.githubConnected || !user.githubToken) {
    throw new HttpError("Connect your GitHub account first", 400)
  }
  const repo = ticket.project.githubRepo?.trim()
  if (!repo) {
    throw new HttpError(
      `Set a GitHub repo for ${ticket.project.name} first (project settings)`,
      400,
    )
  }

  const token = decryptToken(user.githubToken)
  const { htmlUrl } = await createGithubIssue({
    token,
    repo,
    title: `${ticket.key}: ${ticket.title}`,
    body: issueBody(ticket),
  })

  const events = [...((ticket.events as unknown as TicketEvent[]) ?? [])]
  events.push({ at: new Date().toISOString(), kind: "synced", actorId })
  return prisma.ticket.update({
    where: { id },
    data: {
      githubIssueUrl: htmlUrl,
      events: events as unknown as Prisma.InputJsonValue,
    },
  })
}
