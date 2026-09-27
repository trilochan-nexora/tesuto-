"use client"

import {
  BookmarkSimpleIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  RecordIcon,
  TrayIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react"
import { useEffect, useMemo, useState } from "react"
import { AppHeader } from "@/components/app-header"
import { Pagination, usePagination } from "@/components/pagination"
import { TicketRow } from "@/components/ticket-row"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { slaFor } from "@/lib/sla"
import { useStore } from "@/lib/store"
import { DEFAULT_COLUMNS } from "@/lib/types"
import { cn } from "@/lib/utils"

const FILTERS = ["all", "open", "mine", "urgent", "overdue"] as const
type Filter = (typeof FILTERS)[number]
const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  open: "Open",
  mine: "Mine",
  urgent: "Urgent",
  overdue: "Overdue",
}

// Saved inbox views are a per-device convenience (localStorage), validated on
// read so a stale or hand-edited entry can't break the page.
type SavedView = { id: string; name: string; filter: Filter; query: string }
const VIEWS_KEY = "tesuto:inbox-views:v1"
function readViews(): SavedView[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "[]")
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (v): v is SavedView =>
          !!v &&
          typeof v.id === "string" &&
          typeof v.name === "string" &&
          typeof v.query === "string" &&
          (FILTERS as readonly string[]).includes(v.filter),
      )
      .map((v) => ({
        ...v,
        name: v.name.slice(0, 40),
        query: v.query.slice(0, 100),
      }))
      .slice(0, 12)
  } catch {
    return []
  }
}
function writeViews(views: SavedView[]) {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views))
  } catch {}
}

const PER_PAGE = 20

const isOpen = (t: { resolvedAt?: string }) => !t.resolvedAt

const STATUS_RANK = new Map(
  DEFAULT_COLUMNS.map((c, i) => [
    c.id,
    c.terminal ? 999 : DEFAULT_COLUMNS.length - i,
  ]),
)

export default function InboxPage() {
  const { tickets, currentUser } = useStore()
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [views, setViews] = useState<SavedView[]>([])
  const [naming, setNaming] = useState<string | null>(null)
  useEffect(() => setViews(readViews()), [])

  function applyView(v: SavedView) {
    setFilter(v.filter)
    setQuery(v.query)
    pg.setPage(1)
  }
  function saveView() {
    const name = (naming ?? "").trim().slice(0, 40)
    if (!name) return
    const next = [
      ...views.filter((v) => v.name !== name),
      { id: `${Date.now()}`, name, filter, query: query.trim() },
    ].slice(-12)
    setViews(next)
    writeViews(next)
    setNaming(null)
  }
  function removeView(id: string) {
    const next = views.filter((v) => v.id !== id)
    setViews(next)
    writeViews(next)
  }

  const stats = useMemo(() => {
    const open = tickets.filter(isOpen).length
    const urgent = tickets.filter(
      (t) => t.priority === "urgent" && isOpen(t),
    ).length
    const mine = tickets.filter((t) => t.assigneeId === currentUser.id).length
    const done = tickets.filter((t) => !!t.resolvedAt).length
    const overdue = tickets.filter((t) => slaFor(t)?.state === "overdue").length
    return { open, urgent, mine, done, overdue }
  }, [tickets, currentUser.id])

  const filtered = useMemo(() => {
    let list = [...tickets]
    if (filter === "mine")
      list = list.filter((t) => t.assigneeId === currentUser.id)
    if (filter === "urgent") list = list.filter((t) => t.priority === "urgent")
    if (filter === "open") list = list.filter(isOpen)
    if (filter === "overdue")
      list = list.filter((t) => slaFor(t)?.state === "overdue")
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q),
      )
    }
    // Columns are per-project now, so this cross-project feed ranks by the
    // standard column set rather than any one project's live columns —
    // custom columns just fall back to the lowest rank.
    return list.sort(
      (a, b) =>
        (STATUS_RANK.get(b.status) ?? 0) - (STATUS_RANK.get(a.status) ?? 0) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
  }, [tickets, filter, query, currentUser.id])

  const pg = usePagination(filtered, PER_PAGE)

  const statCards = [
    {
      label: "Open tickets",
      value: stats.open,
      icon: RecordIcon,
      tone: "text-sky-500",
    },
    {
      label: "Urgent",
      value: stats.urgent,
      icon: WarningIcon,
      tone: "text-red-500",
    },
    {
      label: "Assigned to me",
      value: stats.mine,
      icon: TrayIcon,
      tone: "text-violet-500",
    },
    {
      label: "Resolved",
      value: stats.done,
      icon: CheckCircleIcon,
      tone: "text-emerald-500",
    },
  ]

  return (
    <>
      <AppHeader
        title="Inbox"
        description="Everything landing from your reporting widgets"
      />

      <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 md:p-6">
        {/* Fixed stat row */}
        <div className="grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((s) => (
            <Card key={s.label}>
              <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
                <CardDescription>{s.label}</CardDescription>
                <s.icon className={`size-4 ${s.tone}`} />
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-semibold tracking-tight">
                  {s.value}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Scrollable ticket list */}
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden py-0">
          <CardHeader className="shrink-0 flex-col gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              value={filter}
              onValueChange={(v) => {
                setFilter(v as Filter)
                pg.setPage(1)
              }}
            >
              <TabsList>
                {FILTERS.map((f) => (
                  <TabsTrigger key={f} value={f}>
                    {FILTER_LABEL[f]}
                    {f === "overdue" && stats.overdue > 0 ? (
                      <span className="ml-1.5 rounded bg-destructive/10 px-1 text-[11px] font-semibold text-destructive tabular-nums">
                        {stats.overdue}
                      </span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:w-64">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tickets…"
                className="pl-8"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  pg.setPage(1)
                }}
              />
            </div>
          </CardHeader>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-4 py-2">
            <BookmarkSimpleIcon className="size-4 text-amber-500" />
            {views.length === 0 && naming === null ? (
              <span className="text-xs text-muted-foreground">
                No saved views yet
              </span>
            ) : null}
            {views.map((v) => {
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
                  <button
                    type="button"
                    className="py-1 pr-1 pl-2.5"
                    onClick={() => applyView(v)}
                    title={`${FILTER_LABEL[v.filter]}${v.query ? ` · "${v.query}"` : ""}`}
                  >
                    {v.name}
                  </button>
                  <button
                    type="button"
                    className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => removeView(v.id)}
                  >
                    <XIcon className="size-3" />
                    <span className="sr-only">Remove view {v.name}</span>
                  </button>
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
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveView()
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
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!naming.trim()}
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

          <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
            {filtered.length === 0 ? (
              <Empty className="py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TrayIcon />
                  </EmptyMedia>
                  <EmptyTitle>No tickets found</EmptyTitle>
                  <EmptyDescription>
                    Try a different filter or clear your search.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col">
                {pg.slice.map((t) => (
                  <TicketRow key={t.id} ticket={t} />
                ))}
              </div>
            )}
          </CardContent>

          {filtered.length > 0 ? (
            <div className="shrink-0 border-t px-4 py-2.5">
              <Pagination
                page={pg.page}
                pageCount={pg.pageCount}
                total={pg.total}
                perPage={pg.perPage}
                onPage={pg.setPage}
                noun="tickets"
              />
            </div>
          ) : null}
        </Card>
      </div>
    </>
  )
}
