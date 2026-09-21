"use client"

import {
  CheckCircle2,
  CircleDot,
  Inbox as InboxIcon,
  Search,
  TriangleAlert,
} from "lucide-react"
import { useMemo, useState } from "react"
import { AppHeader } from "@/components/app-header"
import { Pagination, usePagination } from "@/components/pagination"
import { TicketRow } from "@/components/ticket-row"
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
import { useStore } from "@/lib/store"
import { DEFAULT_COLUMNS } from "@/lib/types"

type Filter = "all" | "mine" | "urgent" | "open"

const PER_PAGE = 20

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

  const isOpen = (t: { resolvedAt?: string }) => !t.resolvedAt

  const stats = useMemo(() => {
    const open = tickets.filter(isOpen).length
    const urgent = tickets.filter(
      (t) => t.priority === "urgent" && isOpen(t),
    ).length
    const mine = tickets.filter((t) => t.assigneeId === currentUser.id).length
    const done = tickets.filter((t) => !!t.resolvedAt).length
    return { open, urgent, mine, done }
  }, [tickets, currentUser.id])

  const filtered = useMemo(() => {
    let list = [...tickets]
    if (filter === "mine")
      list = list.filter((t) => t.assigneeId === currentUser.id)
    if (filter === "urgent") list = list.filter((t) => t.priority === "urgent")
    if (filter === "open") list = list.filter(isOpen)
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
      icon: CircleDot,
      tone: "text-sky-500",
    },
    {
      label: "Urgent",
      value: stats.urgent,
      icon: TriangleAlert,
      tone: "text-red-500",
    },
    {
      label: "Assigned to me",
      value: stats.mine,
      icon: InboxIcon,
      tone: "text-violet-500",
    },
    {
      label: "Resolved",
      value: stats.done,
      icon: CheckCircle2,
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
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="mine">Mine</TabsTrigger>
                <TabsTrigger value="urgent">Urgent</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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

          <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
            {filtered.length === 0 ? (
              <Empty className="py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <InboxIcon />
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
