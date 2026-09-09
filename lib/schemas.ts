import { z } from "zod"

export const zPriority = z.enum(["urgent", "high", "medium", "low"])
export const zType = z.enum(["bug", "feature", "task", "question"])
export const zRole = z.enum(["admin", "member"])

export const zRect = z.object({
  width: z.number(),
  height: z.number(),
})

export const zDomSnapshot = z.object({
  selector: z.string(),
  tag: z.string(),
  text: z.string().optional(),
  rect: zRect.optional(),
  // widget "pin anywhere" mode carries normalized page coords instead
  x: z.number().optional(),
  y: z.number().optional(),
  view: z.record(z.string(), z.number()).optional(),
})

export const zAnnotation = z.object({
  id: z.string(),
  kind: z.enum(["box", "arrow", "pin"]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  color: z.string(),
  label: z.string().optional(),
})

export const zContext = z.object({
  sessionId: z.string().optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  viewport: z.string().optional(),
  consoleErrors: z.array(z.string()).optional(),
  failedRequests: z.array(z.string()).optional(),
})

/** Inline base64 data URL — cap so a runaway screenshot can't wedge Postgres. */
export const zScreenshot = z.string().max(8_000_000)
