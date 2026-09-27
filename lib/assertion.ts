import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Signed host-identity assertions for the embedded widget.
 *
 * The host app (Hearth) proves who its signed-in user is by signing
 * `{ email, name, exp }` with a shared secret (`TESUTO_WIDGET_SECRET`, set
 * identically on both sides, never shipped to the browser). Tesuto verifies
 * the signature before trusting the identity — a bare project token plus a
 * self-claimed email is no longer enough when the secret is configured.
 *
 * Wire format: `base64url(json).base64url(hmac-sha256)`. Dependency-free on
 * purpose: Hearth duplicates `signAssertion` (comment-noted there), and this
 * module is unit-tested without a database (scripts/assertion-check.mjs).
 */

export type AssertionPayload = {
  email: string
  name?: string
  /** unix seconds */
  exp: number
}

const MAX_ASSERTION_TTL_SECONDS = 5 * 60

export function signAssertion(
  payload: AssertionPayload,
  secret: string,
): string {
  if (!secret) throw new Error("Missing widget secret")
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${sig}`
}

export function verifyAssertion(
  token: unknown,
  secret: string,
): AssertionPayload | null {
  if (!secret || typeof token !== "string") return null
  const dot = token.indexOf(".")
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac("sha256", secret).update(body).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<AssertionPayload>
    if (!payload.email || typeof payload.email !== "string") return null
    const now = Math.floor(Date.now() / 1000)
    if (
      typeof payload.exp !== "number" ||
      payload.exp < now ||
      payload.exp > now + MAX_ASSERTION_TTL_SECONDS
    ) {
      return null
    }
    return {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : undefined,
      exp: payload.exp,
    }
  } catch {
    return null
  }
}
