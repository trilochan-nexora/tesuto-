import { createHmac, randomInt, timingSafeEqual } from "node:crypto"
import { HttpError } from "@/lib/api"
import { createSession } from "@/lib/auth"
import { decryptToken, encryptToken } from "@/lib/crypto"
import { prisma } from "@/lib/db"
import { appSecret, authDevCode, emailFrom, resendApiKey } from "@/lib/env"
import { sendAuthEmail } from "@/lib/notify"
import { PROJECT_COLORS } from "@/lib/types"

/**
 * The decrypted GitHub access token of a connected user — for server-side
 * pulls (Projects import) and issue creation. Callers never see it over HTTP.
 */
export async function connectedGithubToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubConnected: true, githubToken: true },
  })
  if (!user?.githubConnected || !user.githubToken) {
    throw new HttpError("Connect your GitHub account first", 400)
  }
  return decryptToken(user.githubToken)
}

/**
 * Drops server-only fields (`githubToken`) before a user row reaches the API
 * envelope. Apply everywhere a Prisma user is serialized to the client.
 */
export function publicUser<T extends { githubToken?: string | null }>(
  user: T,
): Omit<T, "githubToken"> {
  const { githubToken: _token, ...rest } = user
  return rest
}

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } })
  return users.map(publicUser)
}

const LOGIN_CODE_TTL_MS = 10 * 60 * 1000
const LOGIN_RESEND_WAIT_MS = 60 * 1000
const LOGIN_MAX_ATTEMPTS = 5

function loginSecret() {
  const secret = appSecret()
  if (
    !secret ||
    (process.env.NODE_ENV === "production" &&
      (secret.length < 32 || secret.startsWith("change-me")))
  ) {
    throw new HttpError("Email sign-in is not configured", 503)
  }
  return secret
}

function hashLoginCode(email: string, code: string) {
  return createHmac("sha256", loginSecret())
    .update(`${email}:${code}`)
    .digest("hex")
}

/**
 * Sends a code only for a pre-existing active account. The response is the
 * same for unknown addresses so the endpoint cannot be used as a directory.
 */
export async function requestSignInCode(input: { email: string }) {
  const email = input.email.trim().toLowerCase()
  loginSecret()
  const devCode = authDevCode()
  if (!devCode && (!resendApiKey() || !emailFrom())) {
    throw new HttpError("Email sign-in is not configured", 503)
  }
  const user = await prisma.user.findUnique({
    where: { email },
    select: { active: true },
  })
  if (!user?.active) return { ok: true as const }

  const existing = await prisma.loginCode.findUnique({ where: { email } })
  if (
    existing &&
    Date.now() - existing.lastSentAt.getTime() < LOGIN_RESEND_WAIT_MS
  ) {
    throw new HttpError("A code was just sent — wait a minute to resend", 429)
  }

  if (devCode && !/^\d{6}$/.test(devCode)) {
    throw new HttpError("AUTH_DEV_CODE must contain exactly 6 digits", 503)
  }
  const code = devCode || String(randomInt(0, 1_000_000)).padStart(6, "0")
  const now = new Date()
  await prisma.loginCode.upsert({
    where: { email },
    create: {
      email,
      codeHash: hashLoginCode(email, code),
      expiresAt: new Date(now.getTime() + LOGIN_CODE_TTL_MS),
      attempts: 0,
      lastSentAt: now,
    },
    update: {
      codeHash: hashLoginCode(email, code),
      expiresAt: new Date(now.getTime() + LOGIN_CODE_TTL_MS),
      attempts: 0,
      lastSentAt: now,
    },
  })

  if (!devCode) {
    try {
      await sendAuthEmail(
        email,
        "Your Tesuto sign-in code",
        `<p>Your Tesuto sign-in code is:</p><p><strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>It expires in 10 minutes and can only be used once. If you didn't request it, ignore this email.</p>`,
      )
    } catch (error) {
      await prisma.loginCode.deleteMany({ where: { email } })
      console.error("[auth] sign-in email failed", error)
      throw new HttpError("Sign-in email could not be sent", 503)
    }
  }
  return { ok: true as const }
}

export async function verifySignInCode(input: { email: string; code: string }) {
  const email = input.email.trim().toLowerCase()
  const row = await prisma.loginCode.findUnique({ where: { email } })
  const invalid = () => new HttpError("That code is invalid or expired", 401)
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) await prisma.loginCode.deleteMany({ where: { email } })
    throw invalid()
  }
  if (row.attempts >= LOGIN_MAX_ATTEMPTS) {
    await prisma.loginCode.deleteMany({ where: { email } })
    throw new HttpError("Too many attempts — request a new code", 429)
  }
  const expected = Buffer.from(row.codeHash)
  const actual = Buffer.from(hashLoginCode(email, input.code.trim()))
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await prisma.loginCode.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    })
    throw invalid()
  }
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user?.active) {
    await prisma.loginCode.deleteMany({ where: { email } })
    throw invalid()
  }
  await prisma.loginCode.delete({ where: { email } })
  const session = await createSession(user.id)
  return { user: publicUser(user), session }
}

export async function createUser(input: {
  name: string
  email: string
  role: string
  title?: string
}) {
  const email = input.email.trim().toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing)
    throw new HttpError("A user with that email already exists", 409)
  const count = await prisma.user.count()
  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      role: input.role,
      title: input.title?.trim() || null,
      color: PROJECT_COLORS[count % PROJECT_COLORS.length],
      active: true,
    },
  })
  return publicUser(user)
}

export async function updateUser(
  id: string,
  patch: {
    name?: string
    email?: string
    role?: string
    title?: string | null
    bio?: string | null
    active?: boolean
    color?: string
    githubLogin?: string | null
  },
) {
  const exists = await prisma.user.findUnique({ where: { id } })
  if (!exists) throw new HttpError("User not found", 404)
  const removesActiveAdmin =
    exists.active &&
    exists.role === "admin" &&
    (patch.active === false || (patch.role && patch.role !== "admin"))
  if (removesActiveAdmin) {
    const activeAdmins = await prisma.user.count({
      where: { active: true, role: "admin" },
    })
    if (activeAdmins <= 1) {
      throw new HttpError(
        "The workspace must keep at least one active admin",
        409,
      )
    }
  }
  if (patch.email) {
    const emailOwner = await prisma.user.findUnique({
      where: { email: patch.email.trim().toLowerCase() },
      select: { id: true },
    })
    if (emailOwner && emailOwner.id !== id) {
      throw new HttpError("A user with that email already exists", 409)
    }
  }
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...patch,
      email: patch.email ? patch.email.trim().toLowerCase() : undefined,
    },
  })
  if (patch.active === false) {
    await prisma.session.deleteMany({ where: { userId: id } })
  }
  return publicUser(user)
}

export async function updateProfile(
  id: string,
  patch: {
    name?: string
    title?: string | null
    bio?: string | null
    color?: string
    githubLogin?: string | null
  },
) {
  const user = await prisma.user.update({ where: { id }, data: patch })
  return publicUser(user)
}

/** OAuth callback: stores the (encrypted) token and marks the account linked. */
export async function linkGithubAccount(
  id: string,
  input: { login: string; token: string },
) {
  const user = await prisma.user.update({
    where: { id },
    data: {
      githubLogin: input.login,
      githubToken: encryptToken(input.token),
      githubConnected: true,
    },
  })
  return publicUser(user)
}

export function unlinkGithubAccount(id: string) {
  return prisma.user.update({
    where: { id },
    data: { githubLogin: null, githubToken: null, githubConnected: false },
  })
}
