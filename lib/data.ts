import type {
  Comment,
  Doc,
  Project,
  Sprint,
  Ticket,
  TicketEvent,
  User,
} from "./types"

export const CURRENT_USER_ID = "u1"

export const users: User[] = [
  {
    id: "u1",
    name: "Ava Reyes",
    email: "ava@company.com",
    color: "#7c3aed",
    githubLogin: "avareyes",
    role: "admin",
    title: "Staff Engineer",
    active: true,
  },
  {
    id: "u2",
    name: "Marcus Lin",
    email: "marcus@company.com",
    color: "#0ea5e9",
    role: "member",
    title: "Backend Engineer",
    active: true,
  },
  {
    id: "u3",
    name: "Priya Nair",
    email: "priya@company.com",
    color: "#f59e0b",
    githubLogin: "priyanair",
    role: "admin",
    title: "Engineering Manager",
    active: true,
  },
  {
    id: "u4",
    name: "Dan Osei",
    email: "dan@company.com",
    color: "#10b981",
    role: "member",
    title: "Frontend Engineer",
    active: true,
  },
  {
    id: "u5",
    name: "Lena Fischer",
    email: "lena@company.com",
    color: "#ec4899",
    role: "member",
    title: "Product Designer",
    active: true,
  },
]

const now = Date.now()
const ago = (h: number) => new Date(now - h * 3600_000).toISOString()
const inDays = (d: number) => new Date(now + d * 24 * 3600_000).toISOString()

export const projects: Project[] = [
  {
    id: "p1",
    key: "KAIR",
    name: "Kairo",
    description: "Billing and money movement platform",
    color: "#7c3aed",
    token: "tsto_pk_kairo_9f2a7c41d8",
    createdAt: ago(24 * 90),
  },
  {
    id: "p2",
    key: "LEVI",
    name: "Levi",
    description: "Customer-facing web dashboard",
    color: "#0ea5e9",
    token: "tsto_pk_levi_3b81e0f6a2",
    createdAt: ago(24 * 76),
  },
  {
    id: "p3",
    key: "TSTO",
    name: "Tesuto",
    description: "Internal bug reporting tool",
    color: "#f59e0b",
    token: "tsto_pk_tesuto_5c7d19b3e4",
    createdAt: ago(24 * 60),
  },
  {
    id: "p4",
    key: "MKTG",
    name: "Marketing Site",
    description: "Public www + docs",
    color: "#10b981",
    token: "tsto_pk_mktg_a04f2d8e15",
    createdAt: ago(24 * 40),
  },
  {
    id: "p5",
    key: "SAND",
    name: "Sandbox",
    description: "Sandbox project for trying the widget on any site",
    color: "#ec4899",
    token: "tsto_pk_tesuto_7e1a9046cb",
    createdAt: ago(24 * 6),
  },
]

export const sprints: Sprint[] = [
  {
    id: "s1",
    projectId: "p1",
    name: "Kairo — Refund reliability",
    goal: "Kill the NaN totals and the disabled-button bug; ship refund reconciliation.",
    status: "active",
    startDate: ago(24 * 5),
    endDate: inDays(9),
    createdAt: ago(24 * 6),
  },
  {
    id: "s2",
    projectId: "p1",
    name: "Kairo — Settings polish",
    goal: "Currency selector cleanup and command palette shortcut.",
    status: "planned",
    startDate: inDays(10),
    endDate: inDays(24),
    createdAt: ago(24 * 3),
  },
  {
    id: "s3",
    projectId: "p2",
    name: "Levi — Cross-browser pass",
    goal: "Safari sidebar, dark-mode contrast, CSV export timeout.",
    status: "active",
    startDate: ago(24 * 3),
    endDate: inDays(11),
    createdAt: ago(24 * 4),
  },
  {
    id: "s4",
    projectId: "p3",
    name: "Tesuto — Widget hardening",
    goal: "Scoped tokens, picker performance, focus-refetch comments.",
    status: "completed",
    startDate: ago(24 * 26),
    endDate: ago(24 * 12),
    createdAt: ago(24 * 27),
  },
]

export const tickets: Ticket[] = [
  {
    id: "t1",
    key: "KAIR-142",
    projectId: "p1",
    title: "Invoice total renders as NaN on partial refund",
    description:
      "When a partial refund is applied, the invoice summary shows NaN instead of the recomputed total. Repro: create invoice, refund a line item.",
    status: "in_progress",
    priority: "urgent",
    type: "bug",
    reporterId: "u2",
    assigneeId: "u1",
    sourceUrl: "https://app.company.com/invoices/8842",
    domSnapshot: {
      selector: "[data-testid='invoice-total']",
      tag: "span",
      text: "NaN",
      rect: { width: 96, height: 24 },
    },
    context: {
      browser: "Chrome 128",
      os: "macOS 14.5",
      viewport: "1440×900",
      consoleErrors: [
        "TypeError: Cannot read properties of undefined (reading 'amount')",
      ],
      failedRequests: ["GET /api/invoices/8842/refunds → 500"],
    },
    order: 0,
    createdAt: ago(30),
    updatedAt: ago(2),
  },
  {
    id: "t2",
    key: "KAIR-139",
    projectId: "p1",
    title: "Refund button stays disabled after form validation passes",
    description:
      "The refund CTA remains disabled even when all fields are valid until you blur the amount input twice.",
    status: "todo",
    priority: "high",
    type: "bug",
    reporterId: "u3",
    assigneeId: "u4",
    sourceUrl: "https://app.company.com/invoices/8842/refund",
    domSnapshot: {
      selector: "button[aria-label='Submit refund']",
      tag: "button",
      text: "Refund",
      rect: { width: 120, height: 40 },
    },
    context: {
      browser: "Firefox 129",
      os: "Windows 11",
      viewport: "1920×1080",
    },
    order: 0,
    createdAt: ago(52),
    updatedAt: ago(10),
  },
  {
    id: "t3",
    key: "LEVI-88",
    projectId: "p2",
    title: "Sidebar collapses on route change in Safari",
    description:
      "Navigating between dashboard tabs collapses the sidebar unexpectedly. Only reproduces in Safari.",
    status: "review",
    priority: "medium",
    type: "bug",
    reporterId: "u5",
    assigneeId: "u2",
    sourceUrl: "https://levi.company.com/overview",
    domSnapshot: {
      selector: "[data-testid='app-sidebar']",
      tag: "aside",
      rect: { width: 256, height: 812 },
    },
    context: {
      browser: "Safari 17.5",
      os: "macOS 14.5",
      viewport: "1512×982",
      consoleErrors: ["ResizeObserver loop limit exceeded"],
    },
    githubIssueUrl: "https://github.com/company/levi/issues/88",
    order: 0,
    createdAt: ago(70),
    updatedAt: ago(4),
  },
  {
    id: "t4",
    key: "LEVI-91",
    projectId: "p2",
    title: "Add empty state to activity feed",
    description:
      "New accounts see a blank panel. Design an empty state with a call to action.",
    status: "backlog",
    priority: "low",
    type: "feature",
    reporterId: "u1",
    assigneeId: undefined,
    order: 0,
    createdAt: ago(96),
    updatedAt: ago(96),
  },
  {
    id: "t5",
    key: "TSTO-12",
    projectId: "p3",
    title: "Widget picker highlight lags on dense DOM",
    description:
      "On pages with thousands of nodes the hover outline stutters. Debounce elementFromPoint reads.",
    status: "in_progress",
    priority: "medium",
    type: "task",
    reporterId: "u1",
    assigneeId: "u3",
    context: { browser: "Chrome 128", os: "macOS 14.5", viewport: "1440×900" },
    order: 1,
    createdAt: ago(20),
    updatedAt: ago(1),
  },
  {
    id: "t6",
    key: "TSTO-9",
    projectId: "p3",
    title: "Short-lived widget token should include scope claim",
    description:
      "The minted JWT needs an explicit `create:ticket` scope so the tickets route can reject anything broader.",
    status: "done",
    priority: "high",
    type: "task",
    reporterId: "u4",
    assigneeId: "u1",
    order: 0,
    createdAt: ago(140),
    updatedAt: ago(48),
  },
  {
    id: "t7",
    key: "KAIR-150",
    projectId: "p1",
    title: "Currency selector shows duplicate USD entries",
    status: "backlog",
    priority: "low",
    type: "bug",
    reporterId: "u2",
    assigneeId: undefined,
    sourceUrl: "https://app.company.com/settings/currency",
    domSnapshot: {
      selector: "#currency-select",
      tag: "select",
      rect: { width: 220, height: 40 },
    },
    order: 1,
    createdAt: ago(120),
    updatedAt: ago(120),
  },
  {
    id: "t8",
    key: "LEVI-95",
    projectId: "p2",
    title: "Dark mode contrast fails on secondary buttons",
    description:
      "Secondary buttons in dark mode fall below 4.5:1 contrast. Bump the token.",
    status: "todo",
    priority: "medium",
    type: "bug",
    reporterId: "u5",
    assigneeId: "u5",
    sourceUrl: "https://levi.company.com/settings",
    order: 1,
    createdAt: ago(60),
    updatedAt: ago(12),
  },
  {
    id: "t9",
    key: "MKTG-30",
    projectId: "p4",
    title: "Pricing page CTA overlaps footer on mobile",
    status: "review",
    priority: "high",
    type: "bug",
    reporterId: "u3",
    assigneeId: "u4",
    sourceUrl: "https://www.company.com/pricing",
    domSnapshot: {
      selector: ".pricing-cta",
      tag: "a",
      text: "Start free",
      rect: { width: 160, height: 48 },
    },
    context: {
      browser: "Chrome Mobile",
      os: "Android 14",
      viewport: "390×844",
    },
    order: 0,
    createdAt: ago(44),
    updatedAt: ago(6),
  },
  {
    id: "t10",
    key: "MKTG-28",
    projectId: "p4",
    title: "Migrate blog to new typography scale",
    status: "done",
    priority: "low",
    type: "task",
    reporterId: "u1",
    assigneeId: "u2",
    githubIssueUrl: "https://github.com/company/marketing/issues/28",
    order: 1,
    createdAt: ago(200),
    updatedAt: ago(72),
  },
  {
    id: "t11",
    key: "KAIR-151",
    projectId: "p1",
    title: "Add keyboard shortcut to open command palette",
    status: "todo",
    priority: "low",
    type: "feature",
    reporterId: "u4",
    assigneeId: "u3",
    order: 2,
    createdAt: ago(40),
    updatedAt: ago(40),
  },
  {
    id: "t12",
    key: "TSTO-15",
    projectId: "p3",
    title: "Comment thread should refetch on window focus",
    status: "in_progress",
    priority: "medium",
    type: "feature",
    reporterId: "u1",
    assigneeId: "u1",
    order: 2,
    createdAt: ago(18),
    updatedAt: ago(3),
  },
  {
    id: "t13",
    key: "LEVI-99",
    projectId: "p2",
    title: "Export report to CSV times out over 10k rows",
    status: "backlog",
    priority: "high",
    type: "bug",
    reporterId: "u2",
    assigneeId: undefined,
    context: { failedRequests: ["GET /api/reports/export → 504"] },
    order: 2,
    createdAt: ago(88),
    updatedAt: ago(88),
  },
  {
    id: "t14",
    key: "MKTG-33",
    projectId: "p4",
    title: "Add OG images to blog posts",
    status: "review",
    priority: "low",
    type: "task",
    reporterId: "u5",
    assigneeId: "u5",
    order: 1,
    createdAt: ago(26),
    updatedAt: ago(5),
  },
]

// Backfill an activity trail + timing fields so the analytics dashboard has
// something to chew on. Derived from each ticket's status/assignee, not
// hand-authored per row.
const STATUS_FLOW: Ticket["status"][] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
]

for (const t of tickets) {
  const created = new Date(t.createdAt).getTime()
  const updated = new Date(t.updatedAt).getTime()
  const span = Math.max(updated - created, 3600_000)
  const events: TicketEvent[] = [
    { at: t.createdAt, kind: "created", actorId: t.reporterId },
  ]

  if (t.assigneeId) {
    const assignedAt = new Date(created + span * 0.2).toISOString()
    t.assignedAt = assignedAt
    events.push({
      at: assignedAt,
      kind: "assigned",
      actorId: t.reporterId,
      to: t.assigneeId,
    })
  }

  const targetIndex = STATUS_FLOW.indexOf(t.status)
  for (let i = 1; i <= targetIndex; i++) {
    const at = new Date(
      created + span * (0.3 + 0.6 * (i / Math.max(targetIndex, 1))),
    ).toISOString()
    events.push({
      at,
      kind: "status",
      from: STATUS_FLOW[i - 1],
      to: STATUS_FLOW[i],
    })
    if (STATUS_FLOW[i] === "done") t.resolvedAt = at
  }

  if (t.githubIssueUrl) {
    events.push({
      at: t.updatedAt,
      kind: "synced",
      actorId: t.assigneeId ?? t.reporterId,
    })
  }

  events.sort((a, b) => a.at.localeCompare(b.at))
  t.events = events
}

// Slot in-flight work into the active sprint for its project.
const ACTIVE_SPRINT_BY_PROJECT: Record<string, string> = { p1: "s1", p2: "s3" }
for (const t of tickets) {
  const sprintId = ACTIVE_SPRINT_BY_PROJECT[t.projectId]
  if (sprintId && t.status !== "backlog") t.sprintId = sprintId
}
for (const t of tickets) {
  if (t.projectId === "p3" && t.status === "done") t.sprintId = "s4"
}

export const comments: Comment[] = [
  {
    id: "c1",
    ticketId: "t1",
    authorId: "u1",
    body: "Confirmed on staging. The refund handler returns undefined for `amount` when the line item is fully refunded — that undefined flows into the total reducer.",
    createdAt: ago(2),
  },
  {
    id: "c2",
    ticketId: "t1",
    authorId: "u2",
    body: "Nice find. I'll guard the reducer and add a fallback to 0, then reconcile against the server total.",
    createdAt: ago(1),
  },
  {
    id: "c3",
    ticketId: "t3",
    authorId: "u2",
    body: "It's the ResizeObserver firing during the transition. Wrapping the layout write in requestAnimationFrame fixes it locally.",
    createdAt: ago(4),
  },
  {
    id: "c4",
    ticketId: "t6",
    authorId: "u1",
    body: "Shipped. Token now carries `scope: create:ticket` and a 90s expiry.",
    createdAt: ago(48),
  },
  {
    id: "c5",
    ticketId: "t5",
    authorId: "u3",
    body: "Debounced elementFromPoint to one read per animation frame. Feels smooth on the 5k-node test page now.",
    createdAt: ago(1),
  },
]

export const docs: Doc[] = [
  {
    id: "d1",
    projectId: "p3",
    title: "Tesuto Widget — Embed Guide",
    icon: "book",
    updatedAt: ago(6),
    authorId: "u1",
    content:
      '# Embedding the Tesuto widget\n\nDrop one script tag into any host app and your team can report bugs from the exact element they\'re looking at.\n\n## Quick start\n\n```html\n<script src="https://tesuto.company.com/widget.js" data-project="KAIR" defer></script>\n```\n\n## How auth works\n\nThe widget calls `/api/widget-token` with `credentials: \'include\'`. Because the session cookie is scoped to `.company.com`, this is authenticated without a login screen. The route mints a 90s `create:ticket`-scoped JWT that the widget uses to post the ticket.',
  },
  {
    id: "d2",
    projectId: "p3",
    title: "Ticket lifecycle & board conventions",
    icon: "workflow",
    updatedAt: ago(30),
    authorId: "u3",
    content:
      "# Ticket lifecycle\n\nEvery ticket flows Backlog → To Do → In Progress → In Review → Done. Our board is the source of truth; GitHub sync is a manual, per-ticket action.\n\n## Priorities\n\n- **Urgent** — active incident, drop everything\n- **High** — this sprint\n- **Medium** — planned\n- **Low** — nice to have",
  },
  {
    id: "d3",
    projectId: "p1",
    title: "Kairo — Refund flow spec",
    icon: "file",
    updatedAt: ago(50),
    authorId: "u2",
    content:
      "# Refund flow\n\nRefunds recompute the invoice total server-side and reconcile against the client. Never trust a client-computed total. See [[Ticket lifecycle & board conventions]] for how these ship.\n\n## Edge cases\n\n- Partial refunds must fall back to 0 when a line item is fully refunded.\n- Currency must match the original charge.",
  },
  {
    id: "d4",
    title: "Engineering onboarding",
    icon: "rocket",
    updatedAt: ago(120),
    authorId: "u4",
    content:
      "# Welcome to the team\n\nThis is the internal home for how we build. Start with the [[Tesuto Widget — Embed Guide]], then read [[Ticket lifecycle & board conventions]].\n\n## Conventions\n\n- Conventional Commits\n- TypeScript strict, no `any` without a reason\n- One Zod schema per API route\n\nRelated: [[Kairo — Refund flow spec]]",
  },
]
