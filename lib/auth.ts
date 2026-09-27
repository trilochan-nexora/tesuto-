import { createHash, randomBytes } from "node:crypto"
import { prisma } from "./db"

export const APP_SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-tesuto_session"
    : "tesuto_session"
export const APP_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const WIDGET_SESSION_TTL_MS = 15 * 60 * 1000

export type SessionScope = "app" | "widget"

/** Raw token returned to the client. Only its SHA-256 digest is persisted. */
export function mintToken() {
  return randomBytes(32).toString("base64url")
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export async function createSession(
  userId: string,
  options: { scope?: SessionScope; ttlMs?: number } = {},
) {
  const token = mintToken()
  const scope = options.scope ?? "app"
  const ttlMs = options.ttlMs ?? APP_SESSION_TTL_MS
  const expiresAt = new Date(Date.now() + ttlMs)
  await prisma.session.create({
    data: { token: tokenHash(token), userId, scope, expiresAt },
  })
  return { token, expiresAt }
}

export function bearerFrom(req: Request) {
  const header = req.headers.get("authorization") ?? ""
  return header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : null
}

function cookieFrom(req: Request, name: string) {
  const header = req.headers.get("cookie") ?? ""
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=")
    if (key === name) return decodeURIComponent(value.join("="))
  }
  return null
}

export function sessionTokenFrom(
  req: Request,
  options: { allowCookie?: boolean } = {},
) {
  return (
    bearerFrom(req) ??
    (options.allowCookie === false ? null : cookieFrom(req, APP_SESSION_COOKIE))
  )
}

export async function getSessionUser(
  req: Request,
  options: { scope?: SessionScope; allowCookie?: boolean } = {},
) {
  const token = sessionTokenFrom(req, options)
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { token: tokenHash(token) },
    include: { user: true },
  })
  if (!session || session.scope !== (options.scope ?? "app")) return null
  if (session.expiresAt < new Date() || !session.user.active) {
    await prisma.session.deleteMany({ where: { id: session.id } })
    return null
  }
  return session.user
}

export async function destroySession(token: string | null) {
  if (!token) return
  await prisma.session.deleteMany({ where: { token: tokenHash(token) } })
}

export function appSessionCookie(token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  const maxAge = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000),
  )
  return `${APP_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}${secure}`
}

export function clearAppSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${APP_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
}

export type SessionUser = NonNullable<
  Awaited<ReturnType<typeof getSessionUser>>
>
