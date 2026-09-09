import { HttpError } from "@/lib/api"
import { prisma } from "@/lib/db"

export function listDocs() {
  return prisma.doc.findMany({ orderBy: { createdAt: "desc" } })
}

export function createDoc(
  input: { title?: string; icon?: string; projectId?: string },
  authorId: string,
) {
  return prisma.doc.create({
    data: {
      title: input.title?.trim() || "Untitled",
      icon: input.icon ?? "file",
      projectId: input.projectId ?? null,
      content: "",
      authorId,
    },
  })
}

export async function updateDoc(
  id: string,
  patch: {
    title?: string
    icon?: string
    content?: string
    projectId?: string | null
  },
) {
  const exists = await prisma.doc.findUnique({ where: { id } })
  if (!exists) throw new HttpError("Doc not found", 404)
  return prisma.doc.update({ where: { id }, data: patch })
}

export async function deleteDoc(id: string) {
  await prisma.doc.deleteMany({ where: { id } })
  return { deleted: id }
}
