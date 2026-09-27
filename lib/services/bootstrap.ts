import type { SessionUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  emailFrom,
  githubClientId,
  githubClientSecret,
  releasesWebhookSecret,
  resendApiKey,
  slackWebhookUrl,
} from "@/lib/env"
import type { Integrations } from "@/lib/types"
import { getSetting } from "./settings"
import { safeTicket } from "./tickets"
import { publicUser } from "./users"

/**
 * Everything the client store needs on load, in one round trip. Ticket media
 * is represented by small authenticated URLs; binary evidence is fetched only
 * by the cards/detail views that actually render it.
 */
export async function loadBootstrap(me: SessionUser) {
  const [users, projects, columns, tickets, docs, integrations] =
    await Promise.all([
      prisma.user.findMany({ orderBy: { name: "asc" } }),
      prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.column.findMany({
        orderBy: [{ projectId: "asc" }, { order: "asc" }],
      }),
      prisma.ticket.findMany({
        orderBy: { order: "asc" },
        include: { _count: { select: { comments: true } } },
      }),
      prisma.doc.findMany({ orderBy: { createdAt: "desc" } }),
      loadIntegrations(),
    ])

  return {
    users: users.map(publicUser),
    projects,
    columns,
    tickets: tickets.map(({ _count, ...ticket }) => ({
      ...safeTicket(ticket),
      commentCount: _count.comments,
    })),
    docs,
    integrations,
    me: publicUser(me),
    isAdmin: me.role === "admin",
    githubConnected: me.githubConnected,
  }
}

/** Toggle state + whether the server env can actually deliver it. */
async function loadIntegrations(): Promise<Integrations> {
  const [slack, email, githubSync, githubProjects, clickup, hearthReleases] =
    await Promise.all([
      getSetting("integration.slack"),
      getSetting("integration.email"),
      getSetting("integration.github_sync"),
      getSetting("integration.github_projects_import"),
      getSetting("integration.clickup_import"),
      getSetting("integration.hearth_releases"),
    ])
  return {
    slack: { enabled: slack, available: Boolean(slackWebhookUrl()) },
    email: {
      enabled: email,
      available: Boolean(resendApiKey() && emailFrom()),
    },
    githubSync: { enabled: githubSync, available: true },
    githubProjects: {
      enabled: githubProjects,
      available: Boolean(githubClientId() && githubClientSecret()),
    },
    clickup: { enabled: clickup, available: true },
    hearthReleases: {
      enabled: hearthReleases,
      available: Boolean(releasesWebhookSecret()),
    },
  }
}

/**
 * A cheap fingerprint of everything loadBootstrap() returns. Clients poll this
 * every few seconds and re-fetch the full payload only when it changes — live
 * updates without re-downloading the board on every tick. Row counts catch
 * deletes; projects/columns have no updated_at, so their rows are hashed.
 */
export async function loadBootstrapVersion(): Promise<string> {
  const [row] = await prisma.$queryRaw<{ v: string }[]>`
    SELECT md5(concat_ws('|',
      (SELECT count(*) || ':' || coalesce(max(updated_at)::text, '') FROM tickets),
      (SELECT count(*) || ':' || coalesce(max(created_at)::text, '') FROM comments),
      (SELECT count(*) || ':' || coalesce(max(updated_at)::text, '') FROM users),
      (SELECT count(*) || ':' || coalesce(max(updated_at)::text, '') FROM docs),
      (SELECT coalesce(max(updated_at)::text, '') FROM settings),
      (SELECT md5(coalesce(string_agg(p::text, ',' ORDER BY p.id), '')) FROM projects p),
      (SELECT md5(coalesce(string_agg(c::text, ',' ORDER BY c.id), '')) FROM columns c)
    )) AS v`
  return row.v
}
