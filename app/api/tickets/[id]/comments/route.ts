import { z } from "zod"
import { handler } from "@/lib/api"
import {
  zAttachments,
  zCommentBody,
  zVoiceNote,
} from "@/lib/schemas"
import { addComment, listComments } from "@/lib/services/comments"

const NewCommentSchema = z
  .object({
    body: zCommentBody,
    voice: zVoiceNote.optional(),
    attachments: zAttachments,
  })
  .refine(
    (input) => Boolean(input.body || input.voice || input.attachments.length),
    "Write a message or add an attachment",
  )

export const GET = handler({
  run: (_input, { params }) => listComments(params.id),
})

export const POST = handler({
  schema: NewCommentSchema,
  run: (input, { params, user }) => addComment(params.id, input, user.id),
})
