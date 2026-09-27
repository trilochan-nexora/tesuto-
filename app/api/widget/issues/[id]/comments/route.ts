import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import {
  zAttachments,
  zCommentBody,
  zVoiceNote,
} from "@/lib/schemas"
import { widgetAddComment, widgetComments } from "@/lib/services/widget"

const NewComment = z
  .object({
    body: zCommentBody,
    voice: zVoiceNote.optional(),
    attachments: zAttachments,
  })
  .refine(
    (input) => Boolean(input.body || input.voice || input.attachments.length),
    "Write a message or add an attachment",
  )

export function OPTIONS() {
  return new Response(null, { status: 204 })
}

export const GET = widgetRoute((req, params) => widgetComments(req, params.id))

export const POST = widgetRoute(async (req, params) => {
  enforceRateLimit(req, "widget:comment", {
    limit: 60,
    windowMs: 10 * 60 * 1000,
  })
  const input = NewComment.parse(await req.json())
  return widgetAddComment(req, params.id, input)
})
