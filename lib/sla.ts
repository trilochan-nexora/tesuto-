import type { Ticket, TicketPriority } from "@/lib/types"

/** How long a ticket may stay open, by priority, before it's overdue. */
export const SLA_HOURS: Record<TicketPriority, number> = {
  urgent: 24,
  high: 72,
  medium: 24 * 14,
  low: 24 * 30,
}

export type SlaState = "ok" | "due" | "overdue"

function ageLabel(hours: number) {
  if (hours < 1) return "<1h"
  if (hours < 24) return `${Math.floor(hours)}h`
  const days = hours / 24
  if (days < 14) return `${Math.floor(days)}d`
  return `${Math.floor(days / 7)}w`
}

/**
 * Age of an open ticket against its priority's window: "due" from 75% of the
 * window, "overdue" past it. Resolved tickets have no SLA (null).
 */
export function slaFor(
  ticket: Pick<Ticket, "createdAt" | "resolvedAt" | "priority">,
  now = Date.now(),
): { state: SlaState; age: string; limit: string } | null {
  if (ticket.resolvedAt) return null
  const hours = (now - new Date(ticket.createdAt).getTime()) / 36e5
  if (!Number.isFinite(hours)) return null
  const limitHours = SLA_HOURS[ticket.priority] ?? SLA_HOURS.medium
  const state: SlaState =
    hours >= limitHours ? "overdue" : hours >= limitHours * 0.75 ? "due" : "ok"
  return { state, age: ageLabel(hours), limit: ageLabel(limitHours) }
}
