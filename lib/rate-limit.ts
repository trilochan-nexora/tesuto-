import { createHash } from "node:crypto"
import { HttpError } from "./api"

type Entry = { count: number; resetAt: number }

const globalForRateLimit = globalThis as unknown as {
  tesutoRateLimits?: Map<string, Entry>
}
const buckets =
  globalForRateLimit.tesutoRateLimits ?? new Map<string, Entry>()
globalForRateLimit.tesutoRateLimits = buckets

function requestIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  )
}

/**
 * Small per-process abuse guard. Database-backed resend/attempt limits remain
 * authoritative; this layer cheaply slows broad IP spraying before DB work.
 */
export function enforceRateLimit(
  req: Request,
  namespace: string,
  options: { limit: number; windowMs: number; key?: string },
) {
  const now = Date.now()
  const identity = `${requestIp(req)}:${options.key ?? ""}`
  const digest = createHash("sha256").update(identity).digest("base64url")
  const bucketKey = `${namespace}:${digest}`
  const current = buckets.get(bucketKey)
  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs })
    return
  }
  if (current.count >= options.limit) {
    throw new HttpError("Too many requests — wait a few minutes and retry", 429)
  }
  current.count += 1

  // Bound memory in long-lived processes without a timer.
  if (buckets.size > 5_000) {
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key)
    }
  }
}
