"use client"

import { ChatIcon, ImageIcon } from "@phosphor-icons/react"
import Link from "next/link"
import {
  PriorityBadge,
  StatusBadge,
  TypeIcon,
  UserAvatar,
} from "@/components/shared"
import { slaFor } from "@/lib/sla"
import { useStore } from "@/lib/store"
import type { Ticket } from "@/lib/types"
import { cn } from "@/lib/utils"

export function TicketRow({ ticket }: { ticket: Ticket }) {
  const { getUser, getProject } = useStore()
  const assignee = getUser(ticket.assigneeId)
  const project = getProject(ticket.projectId)
  const commentCount = ticket.commentCount ?? 0
  const sla = slaFor(ticket)

  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="flex items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/50"
    >
      <TypeIcon type={ticket.type} />
      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
        {ticket.key}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {ticket.title}
      </span>
      {sla ? (
        <span
          title={`Open ${sla.age} · ${ticket.priority} tickets are due within ${sla.limit}`}
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
            sla.state === "overdue"
              ? "bg-destructive/10 font-semibold text-destructive"
              : sla.state === "due"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "text-muted-foreground",
          )}
        >
          {sla.state === "overdue" ? `overdue ${sla.age}` : sla.age}
        </span>
      ) : null}

      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
        {ticket.screenshotUrl ? <ImageIcon className="size-3.5" /> : null}
        {commentCount > 0 ? (
          <span className="flex items-center gap-0.5">
            <ChatIcon className="size-3.5" />
            {commentCount}
          </span>
        ) : null}
      </span>

      <span
        className="hidden shrink-0 rounded-md px-2 py-0.5 text-xs font-medium md:inline-flex"
        style={{
          backgroundColor: `${project?.color}1a`,
          color: project?.color,
        }}
      >
        {project?.name}
      </span>

      <div className="hidden w-24 shrink-0 md:block">
        <PriorityBadge priority={ticket.priority} />
      </div>
      <div className="hidden w-28 shrink-0 lg:block">
        <StatusBadge status={ticket.status} projectId={ticket.projectId} />
      </div>
      <UserAvatar user={assignee} />
    </Link>
  )
}
