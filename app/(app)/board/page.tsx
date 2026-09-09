import { AppHeader } from "@/components/app-header"
import { KanbanBoard } from "@/components/board/kanban-board"

export default function BoardPage() {
  return (
    <>
      <AppHeader title="Board" description="All tickets across every project" />
      <div className="h-[calc(100svh-3.5rem)] overflow-hidden">
        <KanbanBoard />
      </div>
    </>
  )
}
