"use client"

import { notFound } from "next/navigation"
import { use } from "react"
import { AppHeader } from "@/components/app-header"
import { KanbanBoard } from "@/components/board/kanban-board"
import { useStore } from "@/lib/store"

export default function ProjectBoardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { getProject } = useStore()
  const project = getProject(id)

  if (!project) notFound()

  return (
    <>
      <AppHeader title={project.name} description={project.description} />
      <div className="h-[calc(100svh-3.5rem)] overflow-hidden">
        <KanbanBoard projectId={project.id} />
      </div>
    </>
  )
}
