"use client"

import Link from "next/link"
import { useReleases } from "@/components/releases-context"
import { cn, formatRelativeTime } from "@/lib/utils"

export function ReleaseRail({ activeId }: { activeId?: string }) {
  const releases = useReleases()

  return (
    <div className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
      <div className="flex-1 overflow-y-auto p-1.5">
        {releases === null ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Loading…
          </p>
        ) : releases.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No releases yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {releases.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/releases/${r.id}`}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                    activeId === r.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <span className="truncate font-medium">{r.version}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {formatRelativeTime(r.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
