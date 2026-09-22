import { HttpError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { deleteStoredMedia } from "@/lib/media"
import { sanitizeRichText } from "@/lib/sanitize"
import { makeProjectToken } from "@/lib/tokens"
import type { TicketEvent } from "@/lib/types"
import { COLUMN_DOTS, DEFAULT_COLUMNS, PROJECT_COLORS } from "@/lib/types"
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

async function assertNameAvailable(name: string) {
  const clash = await prisma.project.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true },
  })
  if (clash) {
    throw new HttpError(`A project named "${name.trim()}" already exists`, 409)
  }
}

export async function createProject(input: {
  name: string
  description: string
}) {
  await assertNameAvailable(input.name)
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
      columns: {
        create: DEFAULT_COLUMNS.map((c, i) => ({
          id: c.id,
          label: c.label,
          description: c.description ?? null,
          dot: c.dot,
          terminal: c.terminal,
          limit: c.limit ?? null,
          order: i,
        })),
      },
    },
  })
}

export async function deleteProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) throw new HttpError("Project not found", 404)
  const media = await prisma.mediaObject.findMany({
    where: { ticket: { projectId: id } },
    select: { storageKey: true },
  })
  await prisma.project.delete({ where: { id } })
  await deleteStoredMedia(media)
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
  if (
    patch.name !== undefined &&
    patch.name.trim().toLowerCase() !== project.name.toLowerCase()
  ) {
    await assertNameAvailable(patch.name)
  }
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
  /** The source board's own status/column label for this issue (e.g. a
   * GitHub Projects "Status" field value), when known. Falls back to
   * `resolved` when absent or when it doesn't match one of `columns`. */
  status?: string
}

/** A source board's own column, carried over 1:1 instead of Tesuto's generic
 * defaults — e.g. a GitHub Projects board's "Status" field options. */
export type ImportedColumn = { label: string; terminal: boolean }

export async function importProject(
  input: {
    name: string
    description: string
    source: string
    issues: ImportedIssue[]
    columns?: ImportedColumn[]
  },
  actorId: string,
) {
  await assertNameAvailable(input.name)
  const [count, key] = await Promise.all([
    prisma.project.count(),
    freshKey(input.name),
  ])

  const columnDefs = (
    input.columns?.length
      ? input.columns
      : DEFAULT_COLUMNS.map((c) => ({ label: c.label, terminal: c.terminal }))
  ).map((c, i) => ({
    id: `col_${i}_${Date.now()}`,
    label: c.label,
    dot: COLUMN_DOTS[i % COLUMN_DOTS.length],
    terminal: c.terminal,
    order: i,
  }))
  const doneCol = columnDefs.find((c) => c.terminal) ?? columnDefs.at(-1)!
  const firstCol = columnDefs[0]
  const iso = new Date()

  const project = await prisma.project.create({
    data: {
      key,
      name: input.name.trim(),
      description: input.description.trim(),
      color: PROJECT_COLORS[count % PROJECT_COLORS.length],
      token: makeProjectToken(),
      columns: { create: columnDefs.map(({ id, ...c }) => ({ id, ...c })) },
      tickets: {
        create: input.issues.map((issue, i) => {
          const target =
            columnDefs.find((c) => c.label === issue.status) ??
            (issue.resolved ? doneCol : firstCol)
          const events: TicketEvent[] = [
            { at: iso.toISOString(), kind: "created", actorId },
          ]
          if (target.terminal) {
            events.push({
              at: iso.toISOString(),
              kind: "status",
              to: target.id,
            })
          }
          return {
            key: `${key}-${i + 1}`,
            title: issue.title,
            description: issue.body ? sanitizeRichText(issue.body) : null,
            status: target.id,
            priority: issue.priority,
            type: issue.type,
            reporterId: actorId,
            order: i,
            resolvedAt: target.terminal ? iso : null,
            events: events as unknown as Prisma.InputJsonValue,
          }
        }),
      },
    },
    include: { tickets: true },
  })
  return project
}
