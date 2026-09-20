"use client"

import { ArrowRight, Download, Plug, Plus, SquareKanban } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { AppHeader } from "@/components/app-header"
import { ImportDialog } from "@/components/import-dialog"
import { NewProjectDialog } from "@/components/new-project-dialog"
import { Pagination, usePagination } from "@/components/pagination"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useStore } from "@/lib/store"

const PER_PAGE = 12

export default function ProjectsPage() {
  const { projects, tickets, integrations } = useStore()
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const pg = usePagination(projects, PER_PAGE)
  const importOff =
    !integrations.githubProjects.enabled && !integrations.clickup.enabled

  return (
    <>
      <AppHeader
        title="Projects"
        description="Each has its own board and widget token"
      />
      <div className="flex flex-col gap-5 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" render={<Link href="/board" />}>
              <SquareKanban data-icon="inline-start" />
              All tickets
            </Button>
            {!importOff ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImporting(true)}
              >
                <Download data-icon="inline-start" />
                Import
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus data-icon="inline-start" />
              Add project
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pg.slice.map((project) => {
            const projectTickets = tickets.filter(
              (t) => t.projectId === project.id,
            )
            const done = projectTickets.filter((t) => !!t.resolvedAt).length
            const total = projectTickets.length
            const pct = total ? Math.round((done / total) * 100) : 0
            const open = total - done

            return (
              <Card
                key={project.id}
                className="relative h-full transition-colors hover:ring-primary/30"
              >
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex size-9 items-center justify-center rounded-lg text-sm font-semibold text-white"
                      style={{ backgroundColor: project.color }}
                    >
                      {project.key.slice(0, 2)}
                    </span>
                    <div className="flex flex-col">
                      <CardTitle className="text-base">
                        <Link
                          href={`/projects/${project.id}`}
                          className="after:absolute after:inset-0"
                        >
                          {project.name}
                        </Link>
                      </CardTitle>
                      <span className="font-mono text-xs text-muted-foreground">
                        {project.key}
                      </span>
                    </div>
                    <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {project.description || "No description"}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{open} open</span>
                      <span className="font-medium">{pct}% done</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                  <Link
                    href={`/projects/${project.id}/settings`}
                    className="relative z-10 inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Plug className="size-3.5" />
                    Widget token
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {projects.length > PER_PAGE ? (
          <Pagination
            page={pg.page}
            pageCount={pg.pageCount}
            total={pg.total}
            perPage={pg.perPage}
            onPage={pg.setPage}
            noun="projects"
          />
        ) : null}
      </div>

      <NewProjectDialog open={adding} onOpenChange={setAdding} />
      <ImportDialog open={importing} onOpenChange={setImporting} />
    </>
  )
}
