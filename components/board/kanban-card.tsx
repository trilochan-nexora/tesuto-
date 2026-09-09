"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ImageIcon, MessageSquare } from "lucide-react"
import { useRouter } from "next/navigation"
import { GithubIcon } from "@/components/icons"
import { PriorityBadge, TypeIcon, UserAvatar } from "@/components/shared"
import { useStore } from "@/lib/store"
import type { Ticket } from "@/lib/types"
import { cn } from "@/lib/utils"

export function KanbanCard({
  ticket,
  overlay,
}: {
  ticket: Ticket
  overlay?: boolean
}) {
  const router = useRouter()
  const { getUser, getProject, comments } = useStore()
  const assignee = getUser(ticket.assigneeId)
  const project = getProject(ticket.projectId)
  const commentCount = comments.filter((c) => c.ticketId === ticket.id).length

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id, data: { status: ticket.status } })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!overlay) router.push(`/tickets/${ticket.id}`)
      }}
      className={cn(
        "group flex cursor-grab flex-col gap-2.5 rounded-lg border bg-card p-3 text-left shadow-xs transition-shadow active:cursor-grabbing",
        !overlay && "hover:border-primary/40 hover:shadow-sm",
        isDragging && "opacity-40",
        overlay && "rotate-2 cursor-grabbing shadow-lg",
      )}
    >
      <div className="flex items-center gap-2">
        <TypeIcon type={ticket.type} />
        <span className="font-mono text-[11px] text-muted-foreground">
          {ticket.key}
        </span>
        <span
          className="ml-auto size-2 rounded-[3px]"
          style={{ backgroundColor: project?.color }}
          title={project?.name}
        />
      </div>

      <p className="text-sm font-medium leading-snug">{ticket.title}</p>

      {ticket.screenshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ticket.screenshotUrl || "/placeholder.svg"}
          alt=""
          className="h-24 w-full rounded-md border object-cover"
        />
      ) : null}

      <div className="flex items-center justify-between">
        <PriorityBadge priority={ticket.priority} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {ticket.githubIssueUrl ? <GithubIcon className="size-3.5" /> : null}
          {ticket.screenshotUrl ? <ImageIcon className="size-3.5" /> : null}
          {commentCount > 0 ? (
            <span className="flex items-center gap-0.5">
              <MessageSquare className="size-3.5" />
              {commentCount}
            </span>
          ) : null}
          <UserAvatar user={assignee} className="size-5" />
        </div>
      </div>
    </div>
  )
}
