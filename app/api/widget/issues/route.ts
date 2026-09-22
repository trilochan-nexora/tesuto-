import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import {
  zContext,
  zDescription,
  zDomSnapshot,
  zHttpUrl,
  zPriority,
  zRecording,
  zScreenshot,
  zTitle,
} from "@/lib/schemas"
import { widgetCreateIssue, widgetIssues } from "@/lib/services/widget"

const CreateSchema = z.object({
  title: zTitle,
  description: zDescription.optional(),
  priority: zPriority.default("medium"),
  sourceUrl: zHttpUrl.optional(),
  screenshot: zScreenshot.optional(),
  recording: zRecording.optional(),
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
  enforceRateLimit(req, "widget:issue", { limit: 30, windowMs: 10 * 60 * 1000 })
  const input = CreateSchema.parse(await req.json())
  return widgetCreateIssue(req, input)
})
