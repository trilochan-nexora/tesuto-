import { HttpError } from "@/lib/api"
import { createSession } from "@/lib/auth"
import { decryptToken, encryptToken } from "@/lib/crypto"
import { prisma } from "@/lib/db"
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

export async function signIn(input: { name: string; email: string }) {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const count = await prisma.user.count()
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      name,
      email,
      role: "member",
      color: PROJECT_COLORS[count % PROJECT_COLORS.length],
      active: true,
    },
    update: { name },
  })
  const token = await createSession(user.id)
  return { user: publicUser(user), token }
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
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...patch,
      email: patch.email ? patch.email.trim().toLowerCase() : undefined,
    },
  })
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
