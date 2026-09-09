"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function usePagination<T>(items: T[], perPage: number) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / perPage))
  const current = Math.min(Math.max(page, 1), pageCount)
  const slice = items.slice((current - 1) * perPage, current * perPage)
  return {
    page: current,
    setPage,
    pageCount,
    slice,
    total: items.length,
    perPage,
  }
}

export function Pagination({
  page,
  pageCount,
  total,
  perPage,
  onPage,
  noun = "items",
  className,
}: {
  page: number
  pageCount: number
  total: number
  perPage: number
  onPage: (page: number) => void
  noun?: string
  className?: string
}) {
  if (total === 0) return null
  const from = (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <span className="tabular-nums">
        {from}–{to} of {total} {noun}
      </span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft className="size-3.5" />
            Prev
          </Button>
          <span className="tabular-nums">
            {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="xs"
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
          >
            Next
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}
