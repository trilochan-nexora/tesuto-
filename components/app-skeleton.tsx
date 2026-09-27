"use client"

import { usePathname } from "next/navigation"
import { TesutoMark } from "@/components/icons"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

function HeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <header className="flex min-h-14 items-center gap-3 border-b px-4 py-2.5">
      <Skeleton className="size-7 rounded-md" />
      <div className="h-6 w-px bg-border" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-2.5 w-48 max-w-[45vw]" />
      </div>
      {action ? <Skeleton className="h-8 w-28 rounded-md" /> : null}
      <Skeleton className="size-8 rounded-md" />
    </header>
  )
}

function AppSidebarSkeleton() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-2">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <TesutoMark className="size-4.5" />
          </div>
          <div className="flex flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-2.5 w-14" />
          </div>
        </div>
        <Skeleton className="h-8 w-full rounded-md" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {Array.from({ length: 4 }, (_, index) => (
                <SidebarMenuItem key={`primary-${index}`}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {Array.from({ length: 3 }, (_, index) => (
                <SidebarMenuItem key={`project-${index}`}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {Array.from({ length: 3 }, (_, index) => (
                <SidebarMenuItem key={`tool-${index}`}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={`stat-${index}`}
          className="flex min-h-24 flex-col justify-between rounded-xl bg-card p-5 ring-1 ring-foreground/10"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="size-4 rounded-full" />
          </div>
          <Skeleton className="h-7 w-12" />
        </div>
      ))}
    </div>
  )
}

function TicketRowsSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={`ticket-${index}`}
          className="flex items-center gap-3 px-4 py-3"
        >
          <Skeleton className="size-5 shrink-0 rounded-md" />
          <Skeleton className="hidden h-3 w-14 shrink-0 sm:block" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton
              className={cn("h-3.5", index % 3 === 0 ? "w-3/5" : "w-4/5")}
            />
            <Skeleton className="h-2.5 w-32" />
          </div>
          <Skeleton className="hidden h-5 w-16 rounded-full md:block" />
          <Skeleton className="size-6 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function InboxSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 md:p-6">
        <StatGridSkeleton />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <div className="flex shrink-0 flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-md sm:w-64" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <TicketRowsSkeleton />
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
        </div>
      </div>
    </>
  )
}

function BoardSkeleton() {
  return (
    <>
      <HeaderSkeleton action />
      <div className="flex h-[calc(100svh-3.5rem)] gap-4 overflow-hidden p-4 md:p-6">
        {Array.from({ length: 4 }, (_, column) => (
          <div
            key={`column-${column}`}
            className="flex w-[19rem] shrink-0 flex-col gap-3 rounded-xl bg-muted/40 p-3"
          >
            <div className="flex items-center gap-2 px-1 py-1">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="ml-auto h-4 w-6 rounded-full" />
            </div>
            {Array.from({ length: 3 - (column % 2) }, (_, card) => (
              <div
                key={`card-${card}`}
                className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="size-5 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-11/12" />
                <Skeleton className="h-3.5 w-2/3" />
                <div className="flex items-center justify-between pt-1">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="size-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function ProjectsSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex flex-col gap-5 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={`project-card-${index}`}
              className="flex min-h-48 flex-col gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
                <Skeleton className="size-7 rounded-md" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <div className="mt-auto flex flex-col gap-2">
                <div className="flex justify-between">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-2.5 w-8" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ChartPanelSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className="flex flex-col gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-2.5 w-48 max-w-full" />
      </div>
      <div className={cn("flex items-end gap-3", tall ? "h-48" : "h-36")}>
        {[45, 72, 58, 88, 64, 78, 52, 91].map((height, index) => (
          <Skeleton
            key={`bar-${index}`}
            className="min-w-3 flex-1 rounded-t-md rounded-b-none"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  )
}

function AnalyticsSkeleton() {
  return (
    <>
      <HeaderSkeleton action />
      <div className="flex w-full flex-col gap-8 p-4 md:p-8">
        <StatGridSkeleton />
        <ChartPanelSkeleton tall />
        <div className="grid gap-4 md:grid-cols-2">
          <ChartPanelSkeleton />
          <ChartPanelSkeleton />
        </div>
        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <Skeleton className="mb-5 h-3.5 w-32" />
          <TicketRowsSkeleton rows={4} />
        </div>
      </div>
    </>
  )
}

function RailSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex h-[calc(100svh-3.5rem)] overflow-hidden">
        <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r p-4 sm:flex">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="size-7 rounded-md" />
          </div>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={`rail-${index}`} className="flex items-center gap-2 py-1">
              <Skeleton className="size-4 rounded-md" />
              <Skeleton className={cn("h-3", index % 2 ? "w-28" : "w-36")} />
            </div>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-6 p-6 md:p-10">
          <Skeleton className="h-5 w-2/5 min-w-44" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-3 w-1/2" />
          <div className="mt-2 flex flex-col gap-3">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton
                key={`copy-${index}`}
                className={cn("h-3", index % 3 === 2 ? "w-2/3" : "w-full")}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function FormSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex w-full max-w-2xl flex-col gap-7 p-4 md:p-8">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 shrink-0 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-9 w-72 max-w-full rounded-lg" />
        {Array.from({ length: 3 }, (_, section) => (
          <section
            key={`form-section-${section}`}
            className="flex flex-col gap-4 border-t pt-6"
          >
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1 rounded-md" />
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

function TeamSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex w-full flex-col gap-6 p-4 md:p-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <div className="grid grid-cols-[minmax(0,2fr)_1fr_1fr_auto] gap-4 border-b px-4 py-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={`heading-${index}`} className="h-3 w-16" />
            ))}
          </div>
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={`person-${index}`}
              className="grid grid-cols-[minmax(0,2fr)_1fr_1fr_auto] items-center gap-4 border-b px-4 py-3 last:border-0"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-36" />
                </div>
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function TicketDetailSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex w-full flex-col gap-6 p-4 md:p-8">
        <Skeleton className="h-4 w-28" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <main className="flex min-w-0 flex-col gap-8">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-7 w-4/5" />
              <Skeleton className="h-7 w-2/5" />
            </div>
            <div className="flex max-w-[68ch] flex-col gap-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="aspect-video w-full rounded-xl" />
            <div className="flex flex-col gap-4 border-t pt-6">
              <Skeleton className="h-8 w-64 rounded-lg" />
              <TicketRowsSkeleton rows={3} />
            </div>
          </main>
          <aside className="flex flex-col gap-6 lg:border-l lg:pl-8">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={`meta-${index}`}
                className="flex items-center justify-between gap-4"
              >
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-28 rounded-md" />
              </div>
            ))}
          </aside>
        </div>
      </div>
    </>
  )
}

function WidgetSkeleton() {
  return (
    <>
      <HeaderSkeleton action />
      <div className="flex w-full flex-col gap-6 p-4 md:p-8">
        <div className="flex flex-col gap-3 rounded-xl bg-muted/40 p-4">
          <Skeleton className="h-3.5 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
        <div className="relative min-h-[34rem] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
            <Skeleton className="size-2.5 rounded-full" />
            <Skeleton className="size-2.5 rounded-full" />
            <Skeleton className="size-2.5 rounded-full" />
            <Skeleton className="ml-3 h-3 w-48" />
          </div>
          <div className="flex h-full items-center justify-center p-10">
            <div className="flex w-full max-w-lg flex-col gap-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
          <Skeleton className="absolute bottom-5 right-5 h-10 w-36 rounded-full" />
        </div>
      </div>
    </>
  )
}

function RouteSkeleton({ pathname }: { pathname: string }) {
  if (pathname === "/analytics") return <AnalyticsSkeleton />
  if (pathname === "/projects") return <ProjectsSkeleton />
  if (pathname === "/board" || /^\/projects\/[^/]+$/.test(pathname)) {
    return <BoardSkeleton />
  }
  if (pathname === "/settings" || pathname.endsWith("/settings")) {
    return <FormSkeleton />
  }
  if (pathname === "/team") return <TeamSkeleton />
  if (pathname === "/widget") return <WidgetSkeleton />
  if (pathname.startsWith("/tickets/")) return <TicketDetailSkeleton />
  if (pathname.startsWith("/sprints") || pathname.startsWith("/releases")) {
    return <RailSkeleton />
  }
  return <InboxSkeleton />
}

export function AppSkeleton() {
  const pathname = usePathname()

  return (
    <div aria-busy="true" aria-label="Loading Tesuto" role="status">
      <SidebarProvider>
        <AppSidebarSkeleton />
        <SidebarInset className="min-w-0 max-w-full overflow-x-hidden">
          <RouteSkeleton pathname={pathname} />
        </SidebarInset>
      </SidebarProvider>
      <span className="sr-only">Loading Tesuto</span>
    </div>
  )
}

export function PageSkeleton() {
  const pathname = usePathname()

  return (
    <div aria-busy="true" aria-label="Loading page" role="status">
      <RouteSkeleton pathname={pathname} />
      <span className="sr-only">Loading page</span>
    </div>
  )
}
