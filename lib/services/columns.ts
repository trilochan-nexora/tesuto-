import { HttpError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { COLUMN_DOTS } from "@/lib/types"

export function listColumns() {
  return prisma.column.findMany({ orderBy: { order: "asc" } })
}

async function renumber(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.column.update({ where: { id }, data: { order: i } }),
    ),
  )
}

export async function createColumn(input: {
  label: string
  description?: string
  dot?: string
}) {
  const columns = await prisma.column.findMany({ orderBy: { order: "asc" } })
  const id = `col_${Date.now()}`
  await prisma.column.create({
    data: {
      id,
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
  await renumber(ids)
  return prisma.column.findUniqueOrThrow({ where: { id } })
}

export async function updateColumn(
  id: string,
  patch: {
    label?: string
    description?: string | null
    dot?: string
    terminal?: boolean
    limit?: number | null
  },
) {
  const exists = await prisma.column.findUnique({ where: { id } })
  if (!exists) throw new HttpError("Column not found", 404)
  return prisma.column.update({ where: { id }, data: patch })
}

export async function removeColumn(id: string, reassignTo: string) {
  const count = await prisma.column.count()
  if (count <= 1) throw new HttpError("Can't delete the last column", 400)
  await prisma.$transaction([
    prisma.ticket.updateMany({
      where: { status: id },
      data: { status: reassignTo },
    }),
    prisma.column.delete({ where: { id } }),
  ])
  return { deleted: id }
}

export async function reorderColumns(ids: string[]) {
  await renumber(ids)
  return listColumns()
}
