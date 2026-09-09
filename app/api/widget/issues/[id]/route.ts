import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { zPriority } from "@/lib/schemas"
import { widgetIssue, widgetPatchIssue } from "@/lib/services/widget"

const PatchSchema = z.object({
  priority: zPriority.optional(),
  status: z.string().optional(),
})

export function OPTIONS() {
  return new Response(null, { status: 204 })
}

export const GET = widgetRoute((req, params) => widgetIssue(req, params.id))

export const PATCH = widgetRoute(async (req, params) => {
  const input = PatchSchema.parse(await req.json())
  return widgetPatchIssue(req, params.id, input)
})
