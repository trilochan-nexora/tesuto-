import { HttpError } from "@/lib/api"
import type { SessionUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import type { InboxFilter, SavedView } from "@/lib/types"

const MAX_PER_USER = 20
const select = {
  id: true,
  ownerId: true,
  name: true,
  filter: true,
  query: true,
  shared: true,
} as const

/** Mine first, then teammates' shared views, oldest first within each. */
export async function listSavedViews(meId: string): Promise<SavedView[]> {
  const rows = await prisma.savedView.findMany({
    where: { OR: [{ ownerId: meId }, { shared: true }] },
    orderBy: { createdAt: "asc" },
    select,
    take: 100,
  })
  return (rows as SavedView[]).sort(
    (a, b) => Number(b.ownerId === meId) - Number(a.ownerId === meId),
  )
}

export async function createSavedView(
  meId: string,
  input: { name: string; filter: InboxFilter; query: string; shared: boolean },
): Promise<SavedView> {
  const count = await prisma.savedView.count({ where: { ownerId: meId } })
  if (count >= MAX_PER_USER) {
    throw new HttpError(`You can keep up to ${MAX_PER_USER} saved views.`, 409)
  }
  // Saving under an existing name replaces that view.
  await prisma.savedView.deleteMany({
    where: { ownerId: meId, name: input.name },
  })
  return (await prisma.savedView.create({
    data: { ...input, ownerId: meId },
    select,
  })) as SavedView
}

async function ownedOrAdmin(id: string, me: SessionUser) {
  const view = await prisma.savedView.findUnique({ where: { id } })
  if (!view || (view.ownerId !== me.id && !view.shared)) {
    throw new HttpError("View not found", 404)
  }
  return view
}

export async function updateSavedView(
  id: string,
  me: SessionUser,
  input: { shared: boolean },
): Promise<SavedView> {
  const view = await ownedOrAdmin(id, me)
  if (view.ownerId !== me.id) {
    throw new HttpError("Only the owner can change this view", 403)
  }
  return (await prisma.savedView.update({
    where: { id },
    data: input,
    select,
  })) as SavedView
}

/** Owners delete their own views; admins can also remove shared ones. */
export async function deleteSavedView(id: string, me: SessionUser) {
  const view = await ownedOrAdmin(id, me)
  if (view.ownerId !== me.id && me.role !== "admin") {
    throw new HttpError("Only the owner or an admin can delete this view", 403)
  }
  await prisma.savedView.delete({ where: { id } })
}
