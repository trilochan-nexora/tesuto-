import { HttpError } from "@/lib/api"
import { prisma } from "@/lib/db"
import type { TicketEvent } from "@/lib/types"
import { DEFAULT_COLUMNS } from "@/lib/types"
import { Prisma } from "@/prisma/generated/client"

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
      return await prisma.ticket.create({
        data: {
          ...data,
          key: nextKey(
            project.key,
            keys.map((k) => k.key),
          ),
        },
      })
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
  const current = await prisma.ticket.findUnique({ where: { id } })
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
    } else {
      data.assignee = { disconnect: true }
      events.push({
        at: iso.toISOString(),
        kind: "unassigned",
        actorId,
        from: current.assigneeId ?? undefined,
      })
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
  }

  data.events = events as unknown as Prisma.InputJsonValue
  return prisma.ticket.update({ where: { id }, data })
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

export async function syncTicketToGithub(id: string, actorId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { project: true },
  })
  if (!ticket) throw new HttpError("Ticket not found", 404)
  const repo = ticket.project.name.toLowerCase().replace(/\s+/g, "-")
  const num = Math.floor(100 + Math.random() * 800)
  const events = [...((ticket.events as unknown as TicketEvent[]) ?? [])]
  events.push({ at: new Date().toISOString(), kind: "synced", actorId })
  return prisma.ticket.update({
    where: { id },
    data: {
      githubIssueUrl: `https://github.com/company/${repo}/issues/${num}`,
      events: events as unknown as Prisma.InputJsonValue,
    },
  })
}
