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
