import { randomUUID } from "node:crypto"
import { HttpError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { deleteStoredMedia, prepareMediaBatch } from "@/lib/media"
import { notifyTicketComment } from "@/lib/notify"
import type { MediaAttachment } from "@/lib/types"
import type { Comment, Prisma } from "@/prisma/generated/client"

export type NewCommentInput = {
  body: string
  voice?: string
  attachments?: Array<{ name: string; data: string }>
}

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
  input: NewCommentInput,
  authorId: string,
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: true },
  })
  if (!ticket) throw new HttpError("Ticket not found", 404)

  const commentId = randomUUID()
  const media = await prepareMediaBatch([
    { data: input.voice, kind: "voice", ticketId, name: "Voice note" },
    ...(input.attachments ?? []).map((item) => ({
      data: item.data,
      kind: "attachment" as const,
      ticketId,
      name: item.name,
    })),
  ])

  const attachments: MediaAttachment[] = media.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind as MediaAttachment["kind"],
    mimeType: item.mimeType,
    size: item.size,
    url: item.url,
  }))
  if (!input.body && !attachments.length) {
    throw new HttpError("Write a message or add an attachment", 400)
  }

  let committed = false
  let comment: Comment
  try {
    comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          id: commentId,
          ticketId,
          authorId,
          body: input.body,
          attachments: attachments.length
            ? (attachments as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      })
      if (media.length) {
        await tx.mediaObject.createMany({
          data: media.map(({ url: _url, name: _name, ...item }) => item),
        })
      }
      return created
    })
    committed = true
  } finally {
    if (!committed) await deleteStoredMedia(media)
  }

  const notificationText =
    input.body ||
    (attachments.some((item) => item.kind === "voice")
      ? "Sent a voice note"
      : "Sent an attachment")
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
    notificationText,
    authorId,
  )
  return comment
}
