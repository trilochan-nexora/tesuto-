import { prisma } from "@/lib/db"
import type { AppNotification, NotificationFeed, TicketEvent } from "@/lib/types"

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const LIMIT = 30

function excerpt(body: string) {
  const text = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}

/**
 * The signed-in user's feed, derived from existing rows (no notification
 * table): others' comments on tickets they reported or own, tickets assigned
 * to them, and status changes others made on those tickets — last 14 days.
 * Ships inside bootstrap, so the version poll keeps it live for free.
 */
export async function loadNotifications(meId: string): Promise<NotificationFeed> {
  const since = new Date(Date.now() - WINDOW_MS)
  const [me, mine] = await Promise.all([
    prisma.user.findUnique({
      where: { id: meId },
      select: { notificationsSeenAt: true },
    }),
    prisma.ticket.findMany({
      where: {
        // No updatedAt filter: a new comment doesn't bump its ticket, and the
        // 14-day window already applies to the comments/events below.
        OR: [{ assigneeId: meId }, { reporterId: meId }],
      },
      select: { id: true, key: true, title: true, events: true },
    }),
  ])
  const byId = new Map(mine.map((t) => [t.id, t]))

  const comments = mine.length
    ? await prisma.comment.findMany({
        where: {
          ticketId: { in: mine.map((t) => t.id) },
          authorId: { not: meId },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
        select: { id: true, ticketId: true, authorId: true, body: true, createdAt: true },
      })
    : []

  const items: AppNotification[] = comments.map((c) => {
    const t = byId.get(c.ticketId)
    return {
      id: `c:${c.id}`,
      kind: "comment",
      ticketId: c.ticketId,
      ticketKey: t?.key ?? "",
      ticketTitle: t?.title ?? "",
      actorId: c.authorId,
      at: c.createdAt.toISOString(),
      detail: excerpt(c.body),
    }
  })

  for (const t of mine) {
    const events = (Array.isArray(t.events) ? t.events : []) as TicketEvent[]
    events.forEach((e, i) => {
      if (!e?.at || new Date(e.at) < since) return
      if (e.actorId && e.actorId === meId) return
      const base = {
        ticketId: t.id,
        ticketKey: t.key,
        ticketTitle: t.title,
        actorId: e.actorId,
        at: e.at,
      }
      if (e.kind === "assigned" && e.to === meId) {
        items.push({ ...base, id: `e:${t.id}:${i}`, kind: "assigned" })
      } else if (e.kind === "status" && e.actorId) {
        items.push({ ...base, id: `e:${t.id}:${i}`, kind: "status", detail: e.to })
      }
    })
  }

  items.sort((a, b) => b.at.localeCompare(a.at))
  return {
    items: items.slice(0, LIMIT),
    seenAt: me?.notificationsSeenAt?.toISOString(),
  }
}

export async function markNotificationsSeen(meId: string) {
  const user = await prisma.user.update({
    where: { id: meId },
    data: { notificationsSeenAt: new Date() },
    select: { notificationsSeenAt: true },
  })
  return { seenAt: user.notificationsSeenAt?.toISOString() }
}
