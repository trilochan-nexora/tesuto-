import { HttpError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { makeProjectToken } from "@/lib/tokens"
import type { TicketEvent } from "@/lib/types"
import { DEFAULT_COLUMNS, PROJECT_COLORS } from "@/lib/types"
import type { Prisma } from "@/prisma/generated/client"

function projectKeyFrom(name: string, taken: Set<string>) {
  const base =
    name
      .replace(/[^a-z0-9\s]/gi, "")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 4) || "PROJ"
  let key = base.length >= 2 ? base : `${name.toUpperCase()}XX`.slice(0, 3)
  let n = 2
  while (taken.has(key)) key = `${base}${n++}`
  return key
}

export function listProjects() {
  return prisma.project.findMany({ orderBy: { createdAt: "asc" } })
}

async function freshKey(name: string) {
  const existing = await prisma.project.findMany({ select: { key: true } })
  return projectKeyFrom(name, new Set(existing.map((p) => p.key)))
}

export async function createProject(input: {
  name: string
  description: string
}) {
  const [count, key] = await Promise.all([
    prisma.project.count(),
    freshKey(input.name),
  ])
  return prisma.project.create({
    data: {
      key,
      name: input.name.trim(),
      description: input.description.trim(),
      color: PROJECT_COLORS[count % PROJECT_COLORS.length],
      token: makeProjectToken(),
    },
  })
}

export async function deleteProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) throw new HttpError("Project not found", 404)
  await prisma.project.delete({ where: { id } })
  return { deleted: id }
}

export type ProjectPatch = {
  name?: string
  description?: string
  /** `owner/repo` — where synced tickets open GitHub issues. `null` clears. */
  githubRepo?: string | null
}

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/

export async function updateProject(id: string, patch: ProjectPatch) {
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) throw new HttpError("Project not found", 404)
  const githubRepo =
    patch.githubRepo === null
      ? null
      : patch.githubRepo !== undefined
        ? patch.githubRepo.trim() || null
        : undefined
  if (githubRepo && !REPO_PATTERN.test(githubRepo)) {
    throw new HttpError(
      "GitHub repo must look like owner/repo (letters, digits, . _ -)",
      422,
    )
  }
  return prisma.project.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description.trim() }
        : {}),
      ...(githubRepo !== undefined ? { githubRepo } : {}),
    },
  })
}

export type ImportedIssue = {
  title: string
  body?: string
  type: string
  priority: string
  resolved: boolean
}

export async function importProject(
  input: {
    name: string
    description: string
    source: string
    issues: ImportedIssue[]
  },
  actorId: string,
) {
  const [count, key] = await Promise.all([
    prisma.project.count(),
    freshKey(input.name),
  ])
  const doneCol =
    DEFAULT_COLUMNS.find((c) => c.terminal) ?? DEFAULT_COLUMNS.at(-1)!
  const iso = new Date()

  const project = await prisma.project.create({
    data: {
      key,
      name: input.name.trim(),
      description: input.description.trim(),
      color: PROJECT_COLORS[count % PROJECT_COLORS.length],
      token: makeProjectToken(),
      tickets: {
        create: input.issues.map((issue, i) => {
          const events: TicketEvent[] = [
            { at: iso.toISOString(), kind: "created", actorId },
          ]
          if (issue.resolved) {
            events.push({
              at: iso.toISOString(),
              kind: "status",
              to: doneCol.id,
            })
          }
          return {
            key: `${key}-${i + 1}`,
            title: issue.title,
            description: issue.body ?? null,
            status: issue.resolved ? doneCol.id : "backlog",
            priority: issue.priority,
            type: issue.type,
            reporterId: actorId,
            order: i,
            resolvedAt: issue.resolved ? iso : null,
            events: events as unknown as Prisma.InputJsonValue,
          }
        }),
      },
    },
    include: { tickets: true },
  })
  return project
}
