"use client"

import { Bug, CircleHelp, ListChecks, SignalHigh, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useStore } from "@/lib/store"
import {
  columnMeta,
  type IssueType,
  PRIORITY_META,
  type TicketPriority,
  type TicketStatus,
  TYPE_META,
  type User,
} from "@/lib/types"
import { cn, formatRelativeTime } from "@/lib/utils"

/**
 * Relative timestamps depend on the current clock, so server and client render
 * slightly different text. `suppressHydrationWarning` is the sanctioned escape
 * hatch for exactly this case.
 */
export function RelativeTime({
  iso,
  className,
}: {
  iso: string
  className?: string
}) {
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {formatRelativeTime(iso)}
    </time>
  )
}

const TYPE_ICON: Record<IssueType, typeof Bug> = {
  bug: Bug,
  feature: Sparkles,
  task: ListChecks,
  question: CircleHelp,
}

const TYPE_COLOR: Record<IssueType, string> = {
  bug: "text-red-500",
  feature: "text-violet-500",
  task: "text-sky-500",
  question: "text-amber-500",
}

export function TypeIcon({
  type,
  className,
}: {
  type: IssueType
  className?: string
}) {
  const Icon = TYPE_ICON[type]
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className={cn("inline-flex", TYPE_COLOR[type], className)}>
            <Icon className="size-4" />
          </span>
        }
      />
      <TooltipContent>{TYPE_META[type].label}</TooltipContent>
    </Tooltip>
  )
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const meta = PRIORITY_META[priority]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        meta.className,
      )}
    >
      <SignalHigh className="size-3.5" />
      {meta.label}
    </span>
  )
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const { columns } = useStore()
  const meta = columnMeta(status, columns)
  return (
    <Badge variant="secondary" className="gap-1.5 font-normal">
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  )
}

export function UserAvatar({
  user,
  className,
}: {
  user?: User
  className?: string
}) {
  if (!user) {
    return (
      <Avatar className={cn("size-6", className)}>
        <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
          ?
        </AvatarFallback>
      </Avatar>
    )
  }
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Avatar className={cn("size-6", className)}>
            <AvatarFallback
              className="text-[10px] font-medium text-white"
              style={{ backgroundColor: user.color }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
        }
      />
      <TooltipContent>{user.name}</TooltipContent>
    </Tooltip>
  )
}
