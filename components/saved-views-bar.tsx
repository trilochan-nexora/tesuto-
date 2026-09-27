"use client"

import {
  BookmarkSimpleIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api-client"
import { useStore } from "@/lib/store"
import {
  FILTER_LABEL,
  INBOX_FILTERS,
  type InboxFilter,
  type SavedView,
} from "@/lib/types"
import { cn } from "@/lib/utils"

// Views used to live in localStorage; move any left there onto the server once.
const LEGACY_KEY = "tesuto:inbox-views:v1"
async function importLegacyViews() {
  let legacy: unknown
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null")
  } catch {
    return false
  }
  if (!Array.isArray(legacy)) return false
  const valid = legacy
    .slice(0, 12)
    .filter(
      (v): v is { name: string; query: string; filter: InboxFilter } =>
        typeof v?.name === "string" &&
        typeof v?.query === "string" &&
        (INBOX_FILTERS as readonly string[]).includes(v?.filter),
    )
  await Promise.all(
    valid.map((v) =>
      api
        .post("/saved-views", {
          name: v.name.slice(0, 40),
          filter: v.filter,
          query: v.query.slice(0, 100),
        })
        .catch(() => {}),
    ),
  )
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {}
  return true
}

export function SavedViewsBar({
  filter,
  query,
  onApply,
}: {
  filter: InboxFilter
  query: string
  onApply: (view: SavedView) => void
}) {
  const { currentUser, isAdmin, getUser } = useStore()
  const [views, setViews] = useState<SavedView[]>([])
  const [naming, setNaming] = useState<string | null>(null)
  const [share, setShare] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await importLegacyViews()
      const list = await api.get<SavedView[]>("/saved-views").catch(() => [])
      if (!cancelled) setViews(list)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    const name = (naming ?? "").trim()
    if (!name) return
    setSaving(true)
    try {
      const view = await api.post<SavedView>("/saved-views", {
        name,
        filter,
        query: query.trim(),
        shared: share,
      })
      setViews((vs) => [
        ...vs.filter((v) => !(v.ownerId === view.ownerId && v.name === name)),
        view,
      ])
      setNaming(null)
      setShare(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save view")
    } finally {
      setSaving(false)
    }
  }

  async function remove(view: SavedView) {
    setViews((vs) => vs.filter((v) => v.id !== view.id))
    try {
      await api.del(`/saved-views/${view.id}`)
    } catch (error) {
      setViews((vs) => [...vs, view])
      toast.error(
        error instanceof Error ? error.message : "Couldn't remove view",
      )
    }
  }

  async function toggleShared(view: SavedView) {
    const next = { ...view, shared: !view.shared }
    setViews((vs) => vs.map((v) => (v.id === view.id ? next : v)))
    try {
      await api.patch(`/saved-views/${view.id}`, { shared: next.shared })
      toast.success(next.shared ? "Shared with the team" : "Now private")
    } catch (error) {
      setViews((vs) => vs.map((v) => (v.id === view.id ? view : v)))
      toast.error(
        error instanceof Error ? error.message : "Couldn't update view",
      )
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-4 py-2">
      <BookmarkSimpleIcon className="size-4 text-amber-500" />
      {views.length === 0 && naming === null ? (
        <span className="text-xs text-muted-foreground">
          No saved views yet
        </span>
      ) : null}
      {views.map((v) => {
        const mine = v.ownerId === currentUser.id
        const owner = mine ? "you" : (getUser(v.ownerId)?.name ?? "a teammate")
        const active = v.filter === filter && v.query === query.trim()
        return (
          <span
            key={v.id}
            className={cn(
              "inline-flex items-center rounded-full border text-xs",
              active
                ? "border-foreground/30 bg-accent font-medium"
                : "hover:bg-accent/60",
            )}
          >
            {mine ? (
              <button
                type="button"
                className={cn(
                  "rounded-full py-1 pl-2",
                  v.shared
                    ? "text-sky-500"
                    : "text-muted-foreground/60 hover:text-foreground",
                )}
                onClick={() => toggleShared(v)}
                title={
                  v.shared
                    ? "Shared with the team — click to make private"
                    : "Private — click to share with the team"
                }
              >
                <UsersThreeIcon
                  className="size-3.5"
                  weight={v.shared ? "fill" : "regular"}
                />
                <span className="sr-only">
                  {v.shared ? `Make ${v.name} private` : `Share ${v.name}`}
                </span>
              </button>
            ) : (
              <UsersThreeIcon
                weight="fill"
                className="ml-2 size-3.5 text-sky-500"
                aria-hidden
              />
            )}
            <button
              type="button"
              className="py-1 pr-1 pl-1.5"
              onClick={() => onApply(v)}
              title={`${FILTER_LABEL[v.filter]}${v.query ? ` · "${v.query}"` : ""} — by ${owner}`}
            >
              {v.name}
            </button>
            {mine || isAdmin ? (
              <button
                type="button"
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                onClick={() => remove(v)}
              >
                <XIcon className="size-3" />
                <span className="sr-only">Remove view {v.name}</span>
              </button>
            ) : (
              <span className="pr-1.5" />
            )}
          </span>
        )
      })}
      {naming === null ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setNaming("")}
        >
          Save current view
        </Button>
      ) : (
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <Input
            autoFocus
            aria-label="View name"
            placeholder="View name"
            maxLength={40}
            className="h-7 w-40 text-xs"
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNaming(null)
            }}
          />
          <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <Switch
              aria-label="Share with team"
              checked={share}
              onCheckedChange={setShare}
            />
            Share with team
          </span>
          <Button
            type="submit"
            size="sm"
            className="h-7 text-xs"
            disabled={!naming.trim() || saving}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setNaming(null)}
          >
            Cancel
          </Button>
        </form>
      )}
    </div>
  )
}
