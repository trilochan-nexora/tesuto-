"use client"

import Link from "next/link"
import { useReleases } from "@/components/releases-context"
import { parseReleaseNotes } from "@/lib/release-notes"
import { cn, formatRelativeTime } from "@/lib/utils"

/** "owner/repo" → "repo" — the source, shown per-row since Tesuto may one
 * day take releases from more than just Hearth. */
function repoName(repo: string) {
  return repo.split("/").pop() || repo
}

export function ReleaseRail({ activeId }: { activeId?: string }) {
  const releases = useReleases()
  // /releases (no [id]) shows the latest release inline — highlight it too.
  const resolvedActiveId = activeId ?? releases?.[0]?.id

  return (
    <div className="flex w-72 shrink-0 flex-col border-r bg-muted/20">
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
            {releases.map((r, i) => {
              const summary = parseReleaseNotes(r.notesMd).summary[0]
              return (
                <li key={r.id}>
                  <Link
                    href={`/releases/${r.id}`}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                      resolvedActiveId === r.id
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">
                        {r.version}
                      </span>
                      {i === 0 ? (
                        <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Latest
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {repoName(r.repo)} · {formatRelativeTime(r.createdAt)}
                    </span>
                    {summary ? (
                      <span className="line-clamp-1 text-xs text-muted-foreground/80">
                        {summary}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
