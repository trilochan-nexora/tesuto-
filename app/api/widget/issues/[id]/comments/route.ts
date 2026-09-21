import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import { zComment } from "@/lib/schemas"
import { widgetAddComment, widgetComments } from "@/lib/services/widget"

const NewComment = z.object({ body: zComment })

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
  return widgetAddComment(req, params.id, input.body)
})
