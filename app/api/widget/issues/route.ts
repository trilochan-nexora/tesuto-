import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { zContext, zDomSnapshot, zPriority, zScreenshot } from "@/lib/schemas"
import { widgetCreateIssue, widgetIssues } from "@/lib/services/widget"

const CreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: zPriority.default("medium"),
  sourceUrl: z.string().optional(),
  screenshot: zScreenshot.optional(),
  domSnapshot: zDomSnapshot.optional(),
  context: zContext.optional(),
})

export function OPTIONS() {
  return new Response(null, { status: 204 })
}

export const GET = widgetRoute((req) => {
  const url = new URL(req.url)
  const scope = url.searchParams.get("scope") === "page" ? "page" : "all"
  return widgetIssues(req, {
    scope,
    url: url.searchParams.get("url") ?? undefined,
  })
})

export const POST = widgetRoute(async (req) => {
  const input = CreateSchema.parse(await req.json())
  return widgetCreateIssue(req, input)
})
