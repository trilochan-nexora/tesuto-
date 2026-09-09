import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { widgetAddComment, widgetComments } from "@/lib/services/widget"

const NewComment = z.object({ body: z.string().min(1) })

export function OPTIONS() {
  return new Response(null, { status: 204 })
}

export const GET = widgetRoute((req, params) => widgetComments(req, params.id))

export const POST = widgetRoute(async (req, params) => {
  const input = NewComment.parse(await req.json())
  return widgetAddComment(req, params.id, input.body)
})
