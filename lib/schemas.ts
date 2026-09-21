import { z } from "zod"

export const zPriority = z.enum(["urgent", "high", "medium", "low"])
export const zType = z.enum(["bug", "feature", "task", "question"])
export const zRole = z.enum(["admin", "member"])
export const zId = z.string().min(1).max(128)
export const zTitle = z.string().trim().min(1).max(200)
export const zDescription = z.string().max(50_000)
export const zComment = z.string().trim().min(1).max(10_000)
export const zHttpUrl = z
  .string()
  .trim()
  .max(2_048)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Use an http(s) URL")

export const zRect = z.object({
  width: z.number().finite().min(0).max(100_000),
  height: z.number().finite().min(0).max(100_000),
})

export const zDomSnapshot = z.object({
  selector: z.string().max(2_000),
  tag: z.string().max(100),
  text: z.string().max(5_000).optional(),
  rect: zRect.optional(),
  // widget "pin anywhere" mode carries normalized page coords instead
  x: z.number().finite().min(0).max(1).optional(),
  y: z.number().finite().min(0).max(1).optional(),
  view: z.record(z.string().max(50), z.number().finite()).optional(),
})

export const zAnnotation = z.object({
  id: z.string().max(128),
  kind: z.enum(["box", "arrow", "pin"]),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite(),
  h: z.number().finite(),
  color: z.string().max(32),
  label: z.string().max(200).optional(),
})

export const zContext = z.object({
  sessionId: z.string().max(128).optional(),
  browser: z.string().max(200).optional(),
  os: z.string().max(200).optional(),
  viewport: z.string().max(100).optional(),
  consoleErrors: z.array(z.string().max(500)).max(20).optional(),
  failedRequests: z.array(z.string().max(500)).max(20).optional(),
})

/** Inline base64 data URL — cap so a runaway screenshot can't wedge Postgres. */
export const zScreenshot = z
  .string()
  .max(8_000_000)
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)

/**
 * Inline base64 screen recording (webm/mp4 data URL). ~10 MB of video is
 * ~13.4 MB base64 — cap the string with headroom; the client enforces the
 * byte cap before upload.
 */
export const zRecording = z
  .string()
  .max(15_000_000)
  .regex(/^data:video\/(?:webm|mp4);base64,[A-Za-z0-9+/=]+$/)
