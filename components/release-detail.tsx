"use client"

import { ArrowSquareOutIcon } from "@phosphor-icons/react"
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

export function ReleaseDetail({
  release,
  isLatest,
}: {
  release: Release
  isLatest?: boolean
}) {
  const parsed = parseReleaseNotes(release.notesMd)

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {release.version}
            {isLatest ? (
              <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white">
                Latest
              </span>
            ) : null}
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
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          <span>
            {release.repo} · {formatRelativeTime(release.createdAt)}
            {parsed.compare ? ` · ${parsed.compare}` : ""}
          </span>
          <span aria-hidden>·</span>
          <Link
            href={release.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            View {release.version} on GitHub
            <ArrowSquareOutIcon className="size-3.5" />
          </Link>
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
