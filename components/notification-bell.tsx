"use client"

import {
  ArrowsLeftRightIcon,
  BellIcon,
  ChatCircleTextIcon,
  UserPlusIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useStore } from "@/lib/store"
import { type AppNotification, unreadCount } from "@/lib/types"
import { cn, formatRelativeTime } from "@/lib/utils"

const KIND_ICON = {
  comment: { icon: ChatCircleTextIcon, className: "text-blue-500" },
  assigned: { icon: UserPlusIcon, className: "text-violet-500" },
  status: { icon: ArrowsLeftRightIcon, className: "text-emerald-500" },
} as const

export function NotificationBell() {
  const { notifications, markNotificationsSeen, getUser, columns } = useStore()
  const unread = unreadCount(notifications)
  // Snapshot the read marker when the menu opens, so items that were new
  // stay highlighted while you're looking at them (opening marks them read).
  const [seenAtOnOpen, setSeenAtOnOpen] = useState<string | undefined>()

  function sentence(n: AppNotification) {
    const who = getUser(n.actorId)?.name ?? "Someone"
    if (n.kind === "comment") return `${who} commented on ${n.ticketKey}`
    if (n.kind === "assigned") return `${who} assigned you ${n.ticketKey}`
    const col = columns.find((c) => c.id === n.detail)?.label
    return `${who} moved ${n.ticketKey}${col ? ` to ${col}` : ""}`
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return
        setSeenAtOnOpen(notifications.seenAt)
        if (unread > 0) markNotificationsSeen()
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              unread ? `Notifications, ${unread} unread` : "Notifications"
            }
          >
            <BellIcon />
            {unread > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2.5 text-sm font-semibold">
          Notifications
        </div>
        {notifications.items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing yet — comments, assignments and status changes on your
            tickets show up here.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto p-1">
            {notifications.items.map((n) => {
              const kind = KIND_ICON[n.kind]
              const isNew = !seenAtOnOpen || n.at > seenAtOnOpen
              return (
                <DropdownMenuItem
                  key={n.id}
                  render={<Link href={`/tickets/${n.ticketId}`} />}
                  className="flex items-start gap-2.5 px-2 py-2"
                >
                  <kind.icon
                    className={cn("mt-0.5 size-4 shrink-0", kind.className)}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm leading-snug">
                      {sentence(n)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {n.kind === "comment" && n.detail
                        ? n.detail
                        : n.ticketTitle}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatRelativeTime(n.at)}
                    </span>
                  </span>
                  {isNew ? (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-destructive">
                      <span className="sr-only">New</span>
                    </span>
                  ) : null}
                </DropdownMenuItem>
              )
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
