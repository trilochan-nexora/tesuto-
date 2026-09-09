/** A board column id. The five below are the seeded defaults; boards can add
 * their own, so at runtime this is just a string. */
export type TicketStatus = string
export type DefaultStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "done"
export type TicketPriority = "urgent" | "high" | "medium" | "low"
export type IssueType = "bug" | "feature" | "task" | "question"

export type Column = {
  id: string
  label: string
  description?: string
  /** tailwind bg-* class for the dot */
  dot: string
  /** tickets moved here count as resolved */
  terminal: boolean
  /** optional work-in-progress limit */
  limit?: number
}

export const DEFAULT_COLUMNS: Column[] = [
  {
    id: "backlog",
    label: "Backlog",
    dot: "bg-muted-foreground",
    terminal: false,
  },
  { id: "todo", label: "To Do", dot: "bg-sky-500", terminal: false },
  {
    id: "in_progress",
    label: "In Progress",
    dot: "bg-amber-500",
    terminal: false,
  },
  { id: "review", label: "In Review", dot: "bg-violet-500", terminal: false },
  { id: "done", label: "Done", dot: "bg-emerald-500", terminal: true },
]

export const COLUMN_DOTS = [
  "bg-muted-foreground",
  "bg-sky-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
]

export function columnMeta(
  id: string,
  columns: Column[] = DEFAULT_COLUMNS,
): Column {
  return (
    columns.find((c) => c.id === id) ??
    DEFAULT_COLUMNS.find((c) => c.id === id) ?? {
      id,
      label: id.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      dot: "bg-muted-foreground",
      terminal: false,
    }
  )
}

export type UserRole = "admin" | "member"

export type User = {
  id: string
  name: string
  email: string
  color: string
  githubLogin?: string
  role: UserRole
  title?: string
  bio?: string
  active: boolean
  githubConnected?: boolean
}

export const ROLE_META: Record<
  UserRole,
  { label: string; description: string }
> = {
  admin: {
    label: "Admin",
    description: "Full access — manage users, projects, and settings",
  },
  member: { label: "Member", description: "Report, triage, and work tickets" },
}

export type Comment = {
  id: string
  ticketId: string
  authorId: string
  body: string
  createdAt: string
}

export type DomSnapshot = {
  selector: string
  tag: string
  text?: string
  rect?: { width: number; height: number }
}

export type AnnotationKind = "box" | "arrow" | "pin"

/** A drag-positioned mark on a ticket screenshot. Coordinates are 0–1
 * fractions of the image so they survive any render size. */
export type Annotation = {
  id: string
  kind: AnnotationKind
  x: number
  y: number
  w: number
  h: number
  color: string
  label?: string
}

export type TicketEventKind =
  | "created"
  | "assigned"
  | "unassigned"
  | "status"
  | "synced"

export type TicketEvent = {
  at: string
  kind: TicketEventKind
  actorId?: string
  from?: string
  to?: string
}

export type TicketContext = {
  sessionId?: string
  browser?: string
  os?: string
  viewport?: string
  consoleErrors?: string[]
  failedRequests?: string[]
}

export type Ticket = {
  id: string
  key: string
  projectId: string
  title: string
  description?: string
  status: TicketStatus
  priority: TicketPriority
  type: IssueType
  reporterId: string
  assigneeId?: string
  sourceUrl?: string
  domSnapshot?: DomSnapshot
  screenshotUrl?: string
  annotations?: Annotation[]
  context?: TicketContext
  githubIssueUrl?: string
  order: number
  parentId?: string
  sprintId?: string
  assignedAt?: string
  resolvedAt?: string
  events?: TicketEvent[]
  createdAt: string
  updatedAt: string
}

export type Project = {
  id: string
  key: string
  name: string
  description: string
  color: string
  /** Publishable token the embedded widget presents to authenticate reports. */
  token: string
  createdAt: string
}

export type SprintStatus = "planned" | "active" | "completed"

export type Sprint = {
  id: string
  projectId: string
  name: string
  goal?: string
  status: SprintStatus
  startDate: string
  endDate: string
  createdAt: string
}

export const SPRINT_STATUS_META: Record<
  SprintStatus,
  { label: string; dot: string }
> = {
  planned: { label: "Planned", dot: "bg-muted-foreground" },
  active: { label: "Active", dot: "bg-emerald-500" },
  completed: { label: "Completed", dot: "bg-violet-500" },
}

export type Doc = {
  id: string
  projectId?: string
  title: string
  icon: string
  updatedAt: string
  authorId: string
  content: string
}

/** Default column metadata, keyed by id. Prefer the store's live columns and
 * `columnMeta()` where a board may have custom columns. */
export const STATUS_META: Record<
  string,
  { label: string; dot: string; column: string }
> = Object.fromEntries(
  DEFAULT_COLUMNS.map((c) => [
    c.id,
    { label: c.label, dot: c.dot, column: c.label },
  ]),
)

export const STATUS_ORDER: string[] = DEFAULT_COLUMNS.map((c) => c.id)

export const PRIORITY_META: Record<
  TicketPriority,
  { label: string; className: string }
> = {
  urgent: {
    label: "Urgent",
    className: "text-red-700 dark:text-red-400 font-semibold",
  },
  high: { label: "High", className: "text-red-600 dark:text-red-400" },
  medium: {
    label: "Medium",
    className: "text-yellow-600 dark:text-yellow-500",
  },
  low: { label: "Low", className: "text-emerald-600 dark:text-emerald-400" },
}

/** dot / fill colour per priority (tailwind bg-*) */
export const PRIORITY_DOT: Record<TicketPriority, string> = {
  urgent: "bg-red-600",
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-emerald-500",
}

/** hex per priority, for charts */
export const PRIORITY_HEX: Record<TicketPriority, string> = {
  urgent: "#b91c1c",
  high: "#ef4444",
  medium: "#eab308",
  low: "#10b981",
}

export const TYPE_META: Record<IssueType, { label: string }> = {
  bug: { label: "Bug" },
  feature: { label: "Feature" },
  task: { label: "Task" },
  question: { label: "Question" },
}

export const PRIORITY_ORDER: TicketPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
]

/** Fixed categorical order for charts — maps to Tesuto's --chart-N tokens. */
export const CHART_SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

/** Annotation palette — distinct, saturated, readable on a screenshot. */
export const ANNOTATION_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
] as const

export const PROJECT_COLORS = [
  "#7c3aed",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#ef4444",
  "#14b8a6",
  "#6366f1",
] as const
