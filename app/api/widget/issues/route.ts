import { z } from "zod"
import { ok, widgetRoute } from "@/lib/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import {
  zAttachments,
  zContext,
  zDescription,
  zDomSnapshot,
  zPriority,
  zRecording,
  zScreenshot,
  zSourceUrl,
  zTitle,
  zVoiceNote,
} from "@/lib/schemas"
import { widgetCreateIssue, widgetIssues } from "@/lib/services/widget"

const CreateSchema = z.object({
  title: zTitle,
  description: zDescription.optional(),
  priority: zPriority.default("medium"),
  sourceUrl: zSourceUrl.optional(),
  screenshot: zScreenshot.optional(),
  recording: zRecording.optional(),
  voice: zVoiceNote.optional(),
  attachments: zAttachments,
  domSnapshot: zDomSnapshot.optional(),
  context: zContext.optional(),
})

export function OPTIONS() {
  return new Response(null, { status: 204 })
}

const ListQuery = z.object({
  scope: z.enum(["page", "all", "mine"]).catch("all"),
  // Page URLs beyond 2 KB aren't real — cap before it reaches the DB query.
  url: z.string().max(2_048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  cursor: z.string().min(1).max(128).optional(),
})

/** Opaque client retry key; same shape as the request-id guard in lib/api. */
const zIdempotencyKey = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,128}$/, "Use 8–128 chars of A-Z a-z 0-9 _ -")

export const GET = widgetRoute(async (req) => {
  const query = ListQuery.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  )
  const { items, nextCursor } = await widgetIssues(req, query)
  // The body stays a plain array; the next page is a header so existing
  // clients that ignore paging keep working.
  return ok(items, {
    headers: nextCursor ? { "X-Next-Cursor": nextCursor } : undefined,
  })
})

export const POST = widgetRoute(async (req) => {
  enforceRateLimit(req, "widget:issue", { limit: 30, windowMs: 10 * 60 * 1000 })
  const header = req.headers.get("idempotency-key")
  const idempotencyKey =
    header === null ? undefined : zIdempotencyKey.parse(header)
  const input = CreateSchema.parse(await req.json())
  const { replayed, ...ticket } = await widgetCreateIssue(req, {
    ...input,
    idempotencyKey,
  })
  return ok(ticket, {
    headers: replayed ? { "Idempotent-Replayed": "true" } : undefined,
  })
})
