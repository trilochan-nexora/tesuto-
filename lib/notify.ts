import { Resend } from "resend"
import { prisma } from "./db"
import { appUrl, emailFrom, resendApiKey, slackWebhookUrl } from "./env"
import { getSetting } from "./services/settings"

/**
 * Outbound notifications: Slack (global incoming webhook) and email (Resend).
 * Callers fire these after a mutation succeeds and never await the delivery —
 * a broken Slack/email config must not fail the API call that triggered it.
 *
 * v1 recipients: Slack receives every event. Email goes to the assignee when
 * one is set and differs from the actor. Inactive users (e.g. the shared
 * "Widget" reporter) never get email.
 */

export type NotifyTicket = {
  id: string
  key: string
  title: string
  priority: string
  sourceUrl?: string | null
  assigneeId?: string | null
  project?: { name: string; key: string } | null
}

type NotifyOpts = {
  event: string
  ticket: NotifyTicket
  context: string
  actorId?: string
  /** Who the email goes to (assignee). Defaults to the ticket assignee. */
  emailTo?: string | null
}

const ticketHref = (t: { id: string }) => `${appUrl()}/tickets/${t.id}`

/**
 * Env must be configured AND the workspace toggle (Settings → Integrations)
 * must be on. Absent row = on.
 */
async function slackEnabled() {
  return Boolean(slackWebhookUrl()) && (await getSetting("integration.slack"))
}

async function emailEnabled() {
  return (
    Boolean(resendApiKey() && emailFrom()) &&
    (await getSetting("integration.email"))
  )
}

async function sendSlack(blocks: unknown) {
  if (!(await slackEnabled())) return
  const url = slackWebhookUrl()
  if (!url) return
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blocks }),
    })
    if (!res.ok) console.error("[notify] slack ", await res.text())
  } catch (err) {
    console.error("[notify] slack failed", err)
  }
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (!(await emailEnabled())) return
  try {
    const resend = new Resend(resendApiKey())
    const { error } = await resend.emails.send({
      from: emailFrom(),
      to,
      subject,
      html,
    })
    if (error) console.error("[notify] email failed", error)
  } catch (err) {
    console.error("[notify] email failed", err)
  }
}

/** Authentication mail must fail closed instead of being silently skipped. */
export async function sendAuthEmail(to: string, subject: string, html: string) {
  const key = resendApiKey()
  const from = emailFrom()
  if (!key || !from) throw new Error("Email authentication is not configured")
  const resend = new Resend(key)
  const { error } = await resend.emails.send({ from, to, subject, html })
  if (error) throw new Error(error.message || "Authentication email failed")
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

/** Resolve a user's email for delivery — never the actor, never inactive. */
async function emailFor(
  userId: string | null | undefined,
  actorId?: string,
): Promise<string | null> {
  if (!userId || !(await emailEnabled()) || userId === actorId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, active: true },
  })
  return user?.active ? user.email : null
}

async function actorName(actorId?: string) {
  if (!actorId) return ""
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true },
  })
  return user?.name ?? ""
}

async function notify(opts: NotifyOpts) {
  try {
    await deliver(opts)
  } catch (err) {
    console.error("[notify] failed", err)
  }
}

async function deliver(opts: NotifyOpts) {
  const t = opts.ticket
  const by = await actorName(opts.actorId)
  const line = [opts.event, opts.context, by ? `by ${by}` : ""]
    .filter(Boolean)
    .join(" ")
  const project = t.project ? `${t.project.name}` : ""

  // Slack only gets assignment pings — #my-tasks is meant to tell someone
  // "this landed on you," not double as a firehose of every ticket event.
  if (opts.event === "assigned to" && (await slackEnabled())) {
    const text =
      `*<${ticketHref(t)}|${t.key}> ${t.title}*\n${line} · ${t.priority}` +
      (project ? ` · ${project}` : "") +
      (t.sourceUrl ? ` from ${t.sourceUrl}` : "")
    await sendSlack([
      {
        type: "section",
        text: { type: "mrkdwn", text },
      },
    ])
  }

  const email =
    opts.emailTo !== undefined
      ? await emailFor(opts.emailTo, opts.actorId)
      : await emailFor(t.assigneeId, opts.actorId)
  if (email) {
    const subject = `[${t.project?.key ?? ""}] ${t.key}: ${t.title}`
    const html = `<p><a href="${escapeHtml(ticketHref(t))}"><strong>${escapeHtml(t.key)}</strong> ${escapeHtml(t.title)}</a>
</p><p>${escapeHtml(line)}${project ? ` — ${escapeHtml(project)}` : ""}</p>`
    await sendEmail(email, subject, html)
  }
}
export async function notifyTicketCreated(
  ticket: NotifyTicket,
  actorId: string,
) {
  void notify({ event: "new ticket", ticket, context: "", actorId })
}

export async function notifyTicketAssigned(
  ticket: NotifyTicket,
  toName: string,
  actorId: string,
) {
  void notify({
    event: "assigned to",
    ticket,
    context: toName,
    actorId,
    emailTo: ticket.assigneeId,
  })
}

export async function notifyTicketUnassigned(
  ticket: NotifyTicket,
  fromName: string,
  actorId: string,
) {
  void notify({
    event: "unassigned",
    ticket,
    context: fromName,
    actorId,
    emailTo: undefined,
  })
}

export async function notifyTicketResolved(
  ticket: NotifyTicket,
  statusLabel: string,
  actorId: string,
) {
  void notify({ event: "moved to", ticket, context: statusLabel, actorId })
}

export async function notifyTicketComment(
  ticket: NotifyTicket,
  body: string,
  authorId: string,
) {
  const excerpt = body.length > 180 ? `${body.slice(0, 180).trimEnd()}…` : body
  void notify({
    event: "comment",
    ticket,
    context: `“${excerpt}”`,
    actorId: authorId,
  })
}
