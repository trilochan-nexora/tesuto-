"use client"

import { ImageIcon, MessageSquare } from "lucide-react"
import Link from "next/link"
import {
  PriorityBadge,
  StatusBadge,
  TypeIcon,
  UserAvatar,
} from "@/components/shared"
import { useStore } from "@/lib/store"
import type { Ticket } from "@/lib/types"

export function TicketRow({ ticket }: { ticket: Ticket }) {
  const { getUser, getProject, comments } = useStore()
  const assignee = getUser(ticket.assigneeId)
  const project = getProject(ticket.projectId)
  const commentCount = comments.filter((c) => c.ticketId === ticket.id).length

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

      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
        {ticket.screenshotUrl ? <ImageIcon className="size-3.5" /> : null}
        {commentCount > 0 ? (
          <span className="flex items-center gap-0.5">
            <MessageSquare className="size-3.5" />
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
        <StatusBadge status={ticket.status} />
      </div>
      <UserAvatar user={assignee} />
    </Link>
  )
}
