"use client"

import { ExternalLink } from "lucide-react"
import Link from "next/link"
import { MarkdownLite } from "@/components/markdown-lite"
import { Badge } from "@/components/ui/badge"
import { parseReleaseNotes, type ReleaseCounts } from "@/lib/release-notes"
import type { Release } from "@/lib/types"
import { cn, formatRelativeTime } from "@/lib/utils"

const COUNT_BADGES: {
  key: keyof ReleaseCounts
  label: string
  className: string
}[] = [
  {
    key: "breaking",
    label: "breaking",
    className: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  },
  {
    key: "added",
    label: "added",
    className:
      "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
  },
  {
    key: "modified",
    label: "modified",
    className:
      "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  },
  {
    key: "deprecated",
    label: "deprecated",
    className:
      "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    key: "fixed",
    label: "fixed",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
]

export function ReleaseDetail({ release }: { release: Release }) {
  const parsed = parseReleaseNotes(release.notesMd)

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {release.version}
            <Link
              href={release.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-5" />
            </Link>
          </h1>
          {parsed.counts && (
            <div className="flex flex-wrap gap-1.5">
              {COUNT_BADGES.filter(
                (b) => (parsed.counts as ReleaseCounts)[b.key] > 0,
              ).map((b) => (
                <Badge
                  key={b.key}
                  variant="outline"
                  className={cn("font-normal", b.className)}
                >
                  {parsed.counts?.[b.key]} {b.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {release.repo} · {formatRelativeTime(release.createdAt)}
          {parsed.compare ? ` · ${parsed.compare}` : ""}
        </p>

        {parsed.summary.length > 0 && (
          <div className="mt-6">
            <MarkdownLite
              content={parsed.summary.map((s) => `- ${s}`).join("\n")}
            />
          </div>
        )}

        {parsed.pmNote && (
          <p className="mt-4 rounded-md border bg-muted/40 px-4 py-3 text-sm">
            <span className="font-medium">In plain terms — </span>
            {parsed.pmNote}
          </p>
        )}

        {parsed.details && (
          <details className="group mt-6" open>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground select-none hover:text-foreground">
              Technical details
            </summary>
            <div className="mt-3 border-l-2 pl-4 pb-12 [&_h2]:text-sm [&_h3]:text-sm">
              <MarkdownLite content={parsed.details} />
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
