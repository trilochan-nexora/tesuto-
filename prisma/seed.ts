/**
 * Seeds the Tesuto database from the same fixtures the client prototype used
 * (`lib/data.ts`). Wipe-then-insert — fine for an internal demo tool.
 *
 *   bun run prisma/seed.ts
 */
import { PrismaPg } from "@prisma/adapter-pg"
import { comments, docs, projects, tickets, users } from "../lib/data"
import { DEFAULT_COLUMNS } from "../lib/types"
import { PrismaClient } from "./generated/client"

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const d = (iso?: string) => (iso ? new Date(iso) : null)

async function main() {
  await prisma.comment.deleteMany()
  await prisma.ticket.deleteMany()
  await prisma.doc.deleteMany()
  await prisma.session.deleteMany()
  await prisma.project.deleteMany()
  await prisma.column.deleteMany()
  await prisma.user.deleteMany()

  await prisma.user.createMany({
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      color: u.color,
      githubLogin: u.githubLogin ?? null,
      role: u.role,
      title: u.title ?? null,
      bio: u.bio ?? null,
      active: u.active,
      githubConnected: false,
    })),
  })

  await prisma.project.createMany({
    data: projects.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      color: p.color,
      token: p.token,
      createdAt: new Date(p.createdAt),
    })),
  })

  // Each project gets its own copy of the standard column set, same as a
  // GitHub Projects board.
  await prisma.column.createMany({
    data: projects.flatMap((p) =>
      DEFAULT_COLUMNS.map((c, i) => ({
        id: c.id,
        projectId: p.id,
        label: c.label,
        description: c.description ?? null,
        dot: c.dot,
        terminal: c.terminal,
        limit: c.limit ?? null,
        order: i,
      })),
    ),
  })

  await prisma.ticket.createMany({
    data: tickets.map((t) => ({
      id: t.id,
      key: t.key,
      projectId: t.projectId,
      title: t.title,
      description: t.description ?? null,
      status: t.status,
      priority: t.priority,
      type: t.type,
      reporterId: t.reporterId,
      assigneeId: t.assigneeId ?? null,
      sourceUrl: t.sourceUrl ?? null,
      domSnapshot: t.domSnapshot ?? undefined,
      screenshotUrl: t.screenshotUrl ?? null,
      annotations: t.annotations ?? undefined,
      context: t.context ?? undefined,
      githubIssueUrl: t.githubIssueUrl ?? null,
      order: t.order,
      parentId: t.parentId ?? null,
      assignedAt: d(t.assignedAt),
      resolvedAt: d(t.resolvedAt),
      events: t.events ?? undefined,
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(t.updatedAt),
    })),
  })

  await prisma.comment.createMany({
    data: comments.map((c) => ({
      id: c.id,
      ticketId: c.ticketId,
      authorId: c.authorId,
      body: c.body,
      createdAt: new Date(c.createdAt),
    })),
  })

  await prisma.doc.createMany({
    data: docs.map((doc) => ({
      id: doc.id,
      projectId: doc.projectId ?? null,
      title: doc.title,
      icon: doc.icon,
      content: doc.content,
      authorId: doc.authorId,
      updatedAt: new Date(doc.updatedAt),
    })),
  })

  const counts = {
    users: await prisma.user.count(),
    projects: await prisma.project.count(),
    columns: await prisma.column.count(),
    tickets: await prisma.ticket.count(),
    comments: await prisma.comment.count(),
    docs: await prisma.doc.count(),
  }
  console.log("seeded", counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
