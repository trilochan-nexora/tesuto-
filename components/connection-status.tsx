"use client"

import { RefreshCw, WifiOff } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useStore } from "@/lib/store"

export function ConnectionStatus() {
  const { authState, refresh, syncError, syncState } = useStore()
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  if (authState !== "authed" || (online && syncState !== "error")) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex min-h-10 items-center justify-center gap-3 border-b border-amber-500/25 bg-amber-50 px-4 py-2 text-sm text-amber-950 shadow-sm dark:bg-amber-950 dark:text-amber-50"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      <span>
        {online
          ? (syncError ?? "Changes may not be up to date.")
          : "You're offline. Existing data stays available."}
      </span>
      {online ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 bg-transparent"
          onClick={refresh}
          disabled={syncState === "syncing"}
        >
          <RefreshCw
            className={`size-3.5 ${syncState === "syncing" ? "animate-spin" : ""}`}
          />
          Retry
        </Button>
      ) : null}
    </div>
  )
}
