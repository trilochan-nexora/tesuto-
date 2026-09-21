import { HttpError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { COLUMN_DOTS } from "@/lib/types"

export function listColumns(projectId?: string) {
  return prisma.column.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: [{ projectId: "asc" }, { order: "asc" }],
  })
}

async function renumber(projectId: string, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.column.update({
        where: { projectId_id: { projectId, id } },
        data: { order: i },
      }),
    ),
  )
}

export async function createColumn(
  projectId: string,
  input: {
    label: string
    description?: string
    dot?: string
  },
) {
  const columns = await prisma.column.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  })
  const id = `col_${Date.now()}`
  await prisma.column.create({
    data: {
      id,
      projectId,
      label: input.label.trim() || "New column",
      description: input.description?.trim() || null,
      dot: input.dot ?? COLUMN_DOTS[columns.length % COLUMN_DOTS.length],
      terminal: false,
      order: columns.length,
    },
  })
  // keep terminal columns ("Done") last
  const term = columns.findIndex((c) => c.terminal)
  const ids = columns.map((c) => c.id)
  ids.splice(term === -1 ? ids.length : term, 0, id)
  await renumber(projectId, ids)
  return prisma.column.findUniqueOrThrow({
    where: { projectId_id: { projectId, id } },
  })
}

export async function updateColumn(
  projectId: string,
  id: string,
  patch: {
    label?: string
    description?: string | null
    dot?: string
    terminal?: boolean
    limit?: number | null
  },
) {
  const exists = await prisma.column.findUnique({
    where: { projectId_id: { projectId, id } },
  })
  if (!exists) throw new HttpError("Column not found", 404)
  return prisma.column.update({
    where: { projectId_id: { projectId, id } },
    data: patch,
  })
}

export async function removeColumn(
  projectId: string,
  id: string,
  reassignTo: string,
) {
  const count = await prisma.column.count({ where: { projectId } })
  if (count <= 1) throw new HttpError("Can't delete the last column", 400)
  await prisma.$transaction([
    prisma.ticket.updateMany({
      where: { projectId, status: id },
      data: { status: reassignTo },
    }),
    prisma.column.delete({ where: { projectId_id: { projectId, id } } }),
  ])
  return { deleted: id }
}

export async function reorderColumns(projectId: string, ids: string[]) {
  await renumber(projectId, ids)
  return listColumns(projectId)
}
