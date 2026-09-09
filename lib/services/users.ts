import { HttpError } from "@/lib/api"
import { createSession } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { PROJECT_COLORS } from "@/lib/types"

export function listUsers() {
  return prisma.user.findMany({ orderBy: { name: "asc" } })
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
  return { user, token }
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
  return prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      role: input.role,
      title: input.title?.trim() || null,
      color: PROJECT_COLORS[count % PROJECT_COLORS.length],
      active: true,
    },
  })
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
  return prisma.user.update({
    where: { id },
    data: {
      ...patch,
      email: patch.email ? patch.email.trim().toLowerCase() : undefined,
    },
  })
}

export function updateProfile(
  id: string,
  patch: {
    name?: string
    title?: string | null
    bio?: string | null
    color?: string
    githubLogin?: string | null
  },
) {
  return prisma.user.update({ where: { id }, data: patch })
}

export function setGithubConnected(id: string, connected: boolean) {
  return prisma.user.update({
    where: { id },
    data: { githubConnected: connected },
  })
}
