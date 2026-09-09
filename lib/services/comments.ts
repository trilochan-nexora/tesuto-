import { HttpError } from "@/lib/api"
import { prisma } from "@/lib/db"

export function listComments(ticketId: string) {
  return prisma.comment.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
  })
}

export async function addComment(
  ticketId: string,
  body: string,
  authorId: string,
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } })
  if (!ticket) throw new HttpError("Ticket not found", 404)
  return prisma.comment.create({
    data: { ticketId, authorId, body },
  })
}
