"use client"

import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"

// Catches render errors inside the app shell, so the sidebar stays usable and
// only the content area is replaced — instead of Next's raw error screen.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[app]", error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <WarningCircleIcon className="size-8 text-destructive" />
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">This page hit an error</h1>
          <p className="text-sm text-muted-foreground">
            Something broke while rendering it. Your data is safe — try again,
            or head back to the inbox.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground">
              Ref {error.digest}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button onClick={reset}>
            <ArrowClockwiseIcon data-icon="inline-start" />
            Try again
          </Button>
          <Button variant="outline" render={<Link href="/inbox" />}>
            Back to inbox
          </Button>
        </div>
      </div>
    </div>
  )
}
