import { randomBytes } from "node:crypto"
import { prisma } from "./db"

/** An opaque bearer token. Stored raw in `Session.token`. */
export function mintToken() {
  return randomBytes(32).toString("base64url")
}

export async function createSession(userId: string) {
  const token = mintToken()
  await prisma.session.create({ data: { token, userId } })
  return token
}

export function bearerFrom(req: Request) {
  const header = req.headers.get("authorization") ?? ""
  return header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : null
}

export async function getSessionUser(req: Request) {
  const token = bearerFrom(req)
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt && session.expiresAt < new Date()) {
    await prisma.session.deleteMany({ where: { token } })
    return null
  }
  return session.user
}

export async function destroySession(token: string | null) {
  if (!token) return
  await prisma.session.deleteMany({ where: { token } })
}

export type SessionUser = NonNullable<
  Awaited<ReturnType<typeof getSessionUser>>
>
