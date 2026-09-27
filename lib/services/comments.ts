import { HttpError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { notifyTicketComment } from "@/lib/notify"

export async function listComments(ticketId: string) {
  const rows = await prisma.comment.findMany({
    where: { ticketId },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return rows.reverse()
}

export async function addComment(
  ticketId: string,
  body: string,
  authorId: string,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: true },
  })
  if (!ticket) throw new HttpError("Ticket not found", 404)
  const comment = await prisma.comment.create({
    data: { ticketId, authorId, body },
  })
  notifyTicketComment(
    {
      id: ticket.id,
      key: ticket.key,
      title: ticket.title,
      priority: ticket.priority,
      sourceUrl: ticket.sourceUrl,
      assigneeId: ticket.assigneeId,
      project: { name: ticket.project.name, key: ticket.project.key },
    },
    body,
    authorId,
  )
  return comment
}
