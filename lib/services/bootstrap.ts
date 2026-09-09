import type { SessionUser } from "@/lib/auth"
import { prisma } from "@/lib/db"

/**
 * Everything the client store needs on load, in one round trip. Screenshots
 * ride along (board cards + the detail view both show them); if inline data
 * URLs ever get heavy enough to matter, move them to blob storage.
 */
export async function loadBootstrap(me: SessionUser) {
  const [users, projects, columns, tickets, comments, docs] = await Promise.all(
    [
      prisma.user.findMany({ orderBy: { name: "asc" } }),
      prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.column.findMany({ orderBy: { order: "asc" } }),
      prisma.ticket.findMany({ orderBy: { order: "asc" } }),
      prisma.comment.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.doc.findMany({ orderBy: { createdAt: "desc" } }),
    ],
  )

  return {
    users,
    projects,
    columns,
    tickets,
    comments,
    docs,
    me,
    isAdmin: me.role === "admin",
    githubConnected: me.githubConnected,
  }
}
