"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { AppHeader } from "@/components/app-header"
import {
  BarChart,
  DonutChart,
  LineChart,
  SERIES,
  StatTile,
} from "@/components/charts"
import { PriorityBadge, TypeIcon } from "@/components/shared"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  agingOpenTickets,
  assigneePerformance,
  cycleTimes,
  formatDuration,
  priorityCounts,
  projectBreakdown,
  statusCounts,
  throughput,
  typeCounts,
} from "@/lib/analytics"
import { useStore } from "@/lib/store"
import { PRIORITY_HEX, PRIORITY_META, TYPE_META } from "@/lib/types"
import { initials } from "@/lib/utils"

type Range = "all" | "p1" | "p2" | "p3" | "p4" | "p5"

export default function AnalyticsPage() {
  const { tickets, users, projects, columns } = useStore()
  const [projectId, setProjectId] = useState<Range>("all")

  const scoped = useMemo(
    () =>
      projectId === "all"
        ? tickets
        : tickets.filter((t) => t.projectId === projectId),
    [tickets, projectId],
  )

  const cycle = useMemo(() => cycleTimes(scoped), [scoped])
  const flow = useMemo(() => throughput(scoped, 21), [scoped])
  const byStatus = useMemo(
    () => statusCounts(scoped, columns),
    [scoped, columns],
  )
  const byPriority = useMemo(() => priorityCounts(scoped), [scoped])
  const byType = useMemo(() => typeCounts(scoped), [scoped])
  const byProject = useMemo(
    () => projectBreakdown(tickets, projects),
    [tickets, projects],
  )
  const team = useMemo(
    () => assigneePerformance(scoped, users),
    [scoped, users],
  )
  const aging = useMemo(() => agingOpenTickets(scoped, 6), [scoped])

  const openTotal = scoped.filter((t) => !t.resolvedAt).length
  const resolvedRecent = flow.reduce((s, d) => s + d.resolved, 0)

  return (
    <>
      <AppHeader
        title="Analytics"
        description="Throughput, cycle time, and team performance"
      >
        <Tabs value={projectId} onValueChange={(v) => setProjectId(v as Range)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {projects.map((p) => (
              <TabsTrigger key={p.id} value={p.id as Range}>
                {p.key}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </AppHeader>

      <div className="flex w-full flex-col gap-8 p-4 md:p-8">
        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Open tickets"
            value={String(openTotal)}
            hint={`${cycle.unassignedOpen} unassigned`}
          />
          <StatTile
            label="Median time to resolve"
            value={formatDuration(cycle.medianTimeToResolve)}
            hint={`${cycle.resolvedCount} resolved all-time`}
          />
          <StatTile
            label="Avg time to first assignment"
            value={formatDuration(cycle.avgTimeToAssign)}
            hint="report → owner"
          />
          <StatTile
            label="Resolved · last 21 days"
            value={String(resolvedRecent)}
            hint={`${flow.reduce((s, d) => s + d.created, 0)} created`}
          />
        </div>

        {/* Throughput */}
        <section className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">Throughput</h2>
            <p className="text-xs text-muted-foreground">
              Tickets created vs. resolved per day, last 21 days.
            </p>
          </div>
          <LineChart
            labels={flow.map((d) => d.label)}
            series={[
              {
                name: "Created",
                color: SERIES[0],
                points: flow.map((d) => d.created),
              },
              {
                name: "Resolved",
                color: SERIES[2],
                points: flow.map((d) => d.resolved),
              },
            ]}
          />
        </section>

        {/* Status + priority */}
        <div className="grid gap-4 md:grid-cols-2">
          <section className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="text-sm font-semibold">Work by status</h2>
            <BarChart
              data={byStatus.map((s) => ({
                label: s.label,
                value: s.count,
              }))}
            />
          </section>
          <section className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="text-sm font-semibold">Open work by priority</h2>
            <DonutChart
              centerValue={String(openTotal)}
              centerLabel="open tickets"
              segments={byPriority
                .filter((p) => p.open > 0)
                .map((p) => ({
                  label: PRIORITY_META[p.priority].label,
                  value: p.open,
                  color: PRIORITY_HEX[p.priority],
                }))}
            />
          </section>
        </div>

        {/* Team performance */}
        <section className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">Team performance</h2>
            <p className="text-xs text-muted-foreground">
              Per assignee: current load, how long open work has been held, and
              average time from assignment to resolution.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Assignee</th>
                  <th className="pb-2 text-right font-medium">Open</th>
                  <th className="pb-2 text-right font-medium">In progress</th>
                  <th className="pb-2 text-right font-medium">Resolved</th>
                  <th className="pb-2 text-right font-medium">Avg hold</th>
                  <th className="pb-2 text-right font-medium">
                    Avg to resolve
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.map((s) => (
                  <tr key={s.user.id} className="border-b last:border-b-0">
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <span
                          className="flex size-6 items-center justify-center rounded-full text-[10px] font-medium text-white"
                          style={{ backgroundColor: s.user.color }}
                        >
                          {initials(s.user.name)}
                        </span>
                        {s.user.name}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{s.open}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {s.inProgress}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {s.resolved}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatDuration(s.avgHoldHrs)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatDuration(s.avgResolveHrs)}
                    </td>
                  </tr>
                ))}
                {team.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-muted-foreground"
                    >
                      No assigned tickets in this scope yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* Project breakdown + type */}
        <div className="grid gap-4 md:grid-cols-2">
          <section className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="text-sm font-semibold">By project</h2>
            <BarChart
              data={byProject.map((p) => ({
                label: p.project.name,
                value: p.total,
                color: p.project.color,
                sub: `${p.open} open · ${p.done} done · avg resolve ${formatDuration(p.avgResolveHrs)}`,
              }))}
            />
          </section>
          <section className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="text-sm font-semibold">By type</h2>
            <BarChart
              data={byType.map((t, i) => ({
                label: TYPE_META[t.type].label,
                value: t.count,
                color: SERIES[i % SERIES.length],
              }))}
            />
          </section>
        </div>

        {/* Aging */}
        <section className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">Oldest open tickets</h2>
            <p className="text-xs text-muted-foreground">
              Open work sorted by age since it was reported.
            </p>
          </div>
          <ul className="flex flex-col">
            {aging.map(({ ticket, ageHrs }) => (
              <li key={ticket.id}>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="flex items-center gap-3 border-b py-2.5 text-sm last:border-b-0 hover:text-foreground"
                >
                  <TypeIcon type={ticket.type} />
                  <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                    {ticket.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {ticket.title}
                  </span>
                  <span className="hidden sm:block">
                    <PriorityBadge priority={ticket.priority} />
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {formatDuration(ageHrs)} old
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
