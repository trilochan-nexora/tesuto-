import {
  type Column,
  type IssueType,
  PRIORITY_ORDER,
  type Project,
  type Sprint,
  type Ticket,
  type User,
} from "./types"

const isResolved = (t: Ticket) => !!t.resolvedAt

const HOUR = 3600_000
const DAY = 24 * HOUR

export function hoursBetween(a?: string, b?: string) {
  if (!a || !b) return null
  return (new Date(b).getTime() - new Date(a).getTime()) / HOUR
}

export function formatDuration(hours: number | null) {
  if (hours == null) return "—"
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null
}

function median(xs: number[]) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function statusCounts(tickets: Ticket[], columns: Column[]) {
  return columns.map((col) => ({
    status: col.id,
    label: col.label,
    count: tickets.filter((t) => t.status === col.id).length,
  }))
}

export function priorityCounts(tickets: Ticket[]) {
  return PRIORITY_ORDER.map((priority) => ({
    priority,
    count: tickets.filter((t) => t.priority === priority).length,
    open: tickets.filter((t) => t.priority === priority && !isResolved(t))
      .length,
  }))
}

export function typeCounts(tickets: Ticket[]) {
  const kinds: IssueType[] = ["bug", "feature", "task", "question"]
  return kinds.map((type) => ({
    type,
    count: tickets.filter((t) => t.type === type).length,
  }))
}

export function projectBreakdown(tickets: Ticket[], projects: Project[]) {
  return projects
    .map((project) => {
      const scoped = tickets.filter((t) => t.projectId === project.id)
      const done = scoped.filter(isResolved).length
      const resolveTimes = scoped
        .map((t) => hoursBetween(t.createdAt, t.resolvedAt))
        .filter((h): h is number => h != null)
      return {
        project,
        total: scoped.length,
        open: scoped.length - done,
        done,
        avgResolveHrs: mean(resolveTimes),
      }
    })
    .sort((a, b) => b.total - a.total)
}

export function throughput(tickets: Ticket[], days = 21) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = today.getTime() - (days - 1) * DAY

  const buckets: {
    date: string
    label: string
    created: number
    resolved: number
  }[] = []

  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * DAY)
    buckets.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      created: 0,
      resolved: 0,
    })
  }

  const indexOf = (iso?: string) => {
    if (!iso) return -1
    const day = new Date(iso).setHours(0, 0, 0, 0)
    const i = Math.round((day - start) / DAY)
    return i >= 0 && i < days ? i : -1
  }

  for (const t of tickets) {
    const ci = indexOf(t.createdAt)
    if (ci >= 0) buckets[ci].created++
    const ri = indexOf(t.resolvedAt)
    if (ri >= 0) buckets[ri].resolved++
  }

  return buckets
}

export function cycleTimes(tickets: Ticket[]) {
  const toAssign = tickets
    .map((t) => hoursBetween(t.createdAt, t.assignedAt))
    .filter((h): h is number => h != null && h >= 0)
  const toResolve = tickets
    .map((t) => hoursBetween(t.createdAt, t.resolvedAt))
    .filter((h): h is number => h != null && h >= 0)
  const assignToResolve = tickets
    .map((t) => hoursBetween(t.assignedAt, t.resolvedAt))
    .filter((h): h is number => h != null && h >= 0)

  return {
    avgTimeToAssign: mean(toAssign),
    avgTimeToResolve: mean(toResolve),
    medianTimeToResolve: median(toResolve),
    avgAssignedToResolve: mean(assignToResolve),
    resolvedCount: toResolve.length,
    unassignedOpen: tickets.filter((t) => !t.assigneeId && !isResolved(t))
      .length,
  }
}

export type AssigneeStats = {
  user: User
  open: number
  inProgress: number
  resolved: number
  avgResolveHrs: number | null
  avgHoldHrs: number | null
  load: number
}

export function assigneePerformance(
  tickets: Ticket[],
  users: User[],
): AssigneeStats[] {
  return users
    .map((user) => {
      const mine = tickets.filter((t) => t.assigneeId === user.id)
      const resolved = mine.filter(isResolved)
      const resolveTimes = resolved
        .map((t) => hoursBetween(t.assignedAt ?? t.createdAt, t.resolvedAt))
        .filter((h): h is number => h != null && h >= 0)
      const holdTimes = mine
        .filter((t) => !isResolved(t))
        .map((t) => hoursBetween(t.assignedAt, new Date().toISOString()))
        .filter((h): h is number => h != null && h >= 0)
      const open = mine.filter((t) => !isResolved(t)).length
      return {
        user,
        open,
        inProgress: mine.filter((t) => t.status === "in_progress").length,
        resolved: resolved.length,
        avgResolveHrs: mean(resolveTimes),
        avgHoldHrs: mean(holdTimes),
        load: open,
      }
    })
    .filter((s) => s.open + s.resolved > 0)
    .sort((a, b) => b.resolved - a.resolved || b.open - a.open)
}

export type AgingTicket = { ticket: Ticket; ageHrs: number }

export function sprintProgress(sprint: Sprint, tickets: Ticket[]) {
  const scoped = tickets.filter((t) => t.sprintId === sprint.id)
  const done = scoped.filter(isResolved).length
  const inProgress = scoped.filter(
    (t) => t.status === "in_progress" || t.status === "review",
  ).length
  const total = scoped.length
  const start = new Date(sprint.startDate).setHours(0, 0, 0, 0)
  const end = new Date(sprint.endDate).setHours(0, 0, 0, 0)
  const totalDays = Math.max(1, Math.round((end - start) / DAY))
  const elapsed = Math.round((Date.now() - start) / DAY)
  const daysLeft = Math.max(0, Math.round((end - Date.now()) / DAY))

  return {
    tickets: scoped,
    total,
    done,
    inProgress,
    remaining: total - done,
    pct: total ? Math.round((done / total) * 100) : 0,
    totalDays,
    elapsed: Math.min(Math.max(elapsed, 0), totalDays),
    daysLeft,
    overdue: Date.now() > end && done < total,
  }
}

/** Ideal vs. actual "tickets remaining" across the sprint window. */
export function sprintBurndown(sprint: Sprint, tickets: Ticket[]) {
  const scoped = tickets.filter((t) => t.sprintId === sprint.id)
  const start = new Date(sprint.startDate).setHours(0, 0, 0, 0)
  const end = new Date(sprint.endDate).setHours(0, 0, 0, 0)
  const days = Math.max(1, Math.round((end - start) / DAY))
  const total = scoped.length

  const labels: string[] = []
  const ideal: number[] = []
  const actual: number[] = []

  for (let i = 0; i <= days; i++) {
    const day = start + i * DAY
    labels.push(
      new Date(day).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    )
    ideal.push(Number((total * (1 - i / days)).toFixed(1)))
    if (day > Date.now()) {
      actual.push(NaN)
    } else {
      const resolvedByThen = scoped.filter(
        (t) =>
          t.resolvedAt && new Date(t.resolvedAt).getTime() <= day + DAY - 1,
      ).length
      actual.push(total - resolvedByThen)
    }
  }

  // Trim trailing NaNs so the line stops at "today".
  const lastReal = actual.reduce((acc, v, i) => (Number.isNaN(v) ? acc : i), 0)
  return {
    labels: labels.slice(0, lastReal + 1),
    ideal: ideal.slice(0, lastReal + 1),
    actual: actual.slice(0, lastReal + 1),
  }
}

export function agingOpenTickets(tickets: Ticket[], limit = 6): AgingTicket[] {
  const now = new Date().toISOString()
  return tickets
    .filter((t) => !isResolved(t))
    .map((t) => ({ ticket: t, ageHrs: hoursBetween(t.createdAt, now) ?? 0 }))
    .sort((a, b) => b.ageHrs - a.ageHrs)
    .slice(0, limit)
}
