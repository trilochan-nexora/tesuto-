"use client"

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { useMemo, useState } from "react"
import { KanbanCard } from "@/components/board/kanban-card"
import { ColumnDialog } from "@/components/column-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { NewTicketDialog } from "@/components/new-ticket-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useStore } from "@/lib/store"
import type { Column as ColumnDef, Ticket } from "@/lib/types"
import { cn } from "@/lib/utils"

function BoardColumn({
  col,
  canDelete,
  tickets,
  projectId,
  index,
  total,
  onEditRequest,
  onDelete,
  onMove,
  onArchiveAll,
  onRemoveAll,
}: {
  col: ColumnDef
  canDelete: boolean
  tickets: Ticket[]
  projectId?: string
  index: number
  total: number
  onEditRequest: () => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  onArchiveAll: () => void
  onRemoveAll: () => void
}) {
  const {
    setNodeRef: setSortRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id, data: { type: "column" } })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `cards:${col.id}`,
    data: { type: "cards", status: col.id },
  })
  const overLimit = col.limit != null && tickets.length > col.limit

  return (
    <div
      ref={setSortRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex h-full max-h-full w-72 shrink-0 flex-col rounded-xl bg-muted/40",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex flex-col gap-0.5 px-2 py-2">
        <div className="flex items-center gap-1.5">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
            aria-label={`Reorder ${col.label} column`}
          >
            <GripVertical className="size-4" />
          </button>
          <span className={cn("size-2 rounded-full", col.dot)} />
          <button
            className="truncate text-sm font-medium"
            onDoubleClick={onEditRequest}
          >
            {col.label}
          </button>
          <span
            className={cn(
              "rounded bg-muted px-1.5 text-xs tabular-nums",
              overLimit
                ? "bg-destructive/15 font-medium text-destructive"
                : "text-muted-foreground",
            )}
          >
            {tickets.length}
            {col.limit != null ? ` / ${col.limit}` : ""}
          </span>
          <div className="ml-auto flex items-center">
            <NewTicketDialog
              defaultProjectId={projectId}
              defaultStatus={col.id}
              trigger={
                <Button variant="ghost" size="icon" className="size-6">
                  <Plus className="size-4" />
                </Button>
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" className="size-6">
                    <MoreHorizontal className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onEditRequest}>
                  <Pencil className="size-4" />
                  <span className="whitespace-nowrap">Edit column</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index === 0}
                  onClick={() => onMove(-1)}
                >
                  <ArrowLeft className="size-4" />
                  <span className="whitespace-nowrap">Move left</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index === total - 1}
                  onClick={() => onMove(1)}
                >
                  <ArrowRight className="size-4" />
                  <span className="whitespace-nowrap">Move right</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={col.terminal || tickets.length === 0}
                  onClick={onArchiveAll}
                >
                  <Archive className="size-4" />
                  <span className="whitespace-nowrap">Archive all cards</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={tickets.length === 0}
                  onClick={onRemoveAll}
                >
                  <Trash2 className="size-4" />
                  <span className="whitespace-nowrap">Remove all cards</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!canDelete} onClick={onDelete}>
                  <Trash2 className="size-4" />
                  <span className="whitespace-nowrap">Delete column</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {col.description ? (
          <p className="line-clamp-2 pl-6 pr-2 text-xs leading-snug text-muted-foreground">
            {col.description}
          </p>
        ) : null}
      </div>
      <div
        ref={setDropRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-lg p-2 transition-colors",
          isOver && "bg-primary/5 ring-1 ring-primary/30 ring-inset",
        )}
      >
        <SortableContext
          items={tickets.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tickets.map((t) => (
            <KanbanCard key={t.id} ticket={t} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

export function KanbanBoard({ projectId }: { projectId?: string }) {
  const {
    tickets,
    moveTicket,
    columns,
    addColumn,
    updateColumn,
    removeColumn,
    reorderColumns,
    deleteTickets,
    bulkMove,
  } = useStore()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<"card" | "column" | null>(null)
  const [dialog, setDialog] = useState<
    { mode: "add" } | { mode: "edit"; column: ColumnDef } | null
  >(null)
  const [confirmClear, setConfirmClear] = useState<ColumnDef | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const scoped = useMemo(
    () =>
      projectId ? tickets.filter((t) => t.projectId === projectId) : tickets,
    [tickets, projectId],
  )

  const columnIds = useMemo(() => columns.map((c) => c.id), [columns])
  const firstColumnId = columnIds[0]

  const grouped = useMemo(() => {
    const map: Record<string, Ticket[]> = {}
    for (const c of columns) map[c.id] = []
    for (const t of scoped) {
      const bucket = map[t.status] ?? map[firstColumnId]
      bucket?.push(t)
    }
    for (const id of Object.keys(map)) map[id].sort((a, b) => a.order - b.order)
    return map
  }, [scoped, columns, firstColumnId])

  const activeTicket = activeId ? tickets.find((t) => t.id === activeId) : null
  const activeColumn = activeId ? columns.find((c) => c.id === activeId) : null

  function columnOf(id: string): string | null {
    if (id.startsWith("cards:")) return id.slice(6)
    if (columnIds.includes(id)) return id
    return tickets.find((t) => t.id === id)?.status ?? null
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string)
    setActiveType(e.active.data.current?.type === "column" ? "column" : "card")
  }

  function handleDragOver(e: DragOverEvent) {
    if (activeType === "column") return
    const { active, over } = e
    if (!over) return
    const activeStatus = columnOf(active.id as string)
    const overStatus = columnOf(over.id as string)
    if (!activeStatus || !overStatus || activeStatus === overStatus) return
    moveTicket(active.id as string, overStatus, Date.now())
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    const type = activeType
    setActiveId(null)
    setActiveType(null)
    if (!over) return

    if (type === "column") {
      const overCol = columnOf(over.id as string)
      if (!overCol || overCol === active.id) return
      const oldIndex = columnIds.indexOf(active.id as string)
      const newIndex = columnIds.indexOf(overCol)
      if (oldIndex === -1 || newIndex === -1) return
      reorderColumns(arrayMove(columnIds, oldIndex, newIndex))
      return
    }

    const overStatus = columnOf(over.id as string)
    if (!overStatus) return
    const columnTickets = (grouped[overStatus] ?? []).filter(
      (t) => t.id !== active.id,
    )
    const overIndex = columnTickets.findIndex((t) => t.id === over.id)

    let newOrder: number
    if (overIndex === -1) {
      newOrder = (columnTickets.at(-1)?.order ?? 0) + 1
    } else {
      const prev =
        columnTickets[overIndex - 1]?.order ??
        columnTickets[overIndex].order - 1
      const next = columnTickets[overIndex].order
      newOrder = (prev + next) / 2
    }
    moveTicket(active.id as string, overStatus, newOrder)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex h-full gap-4 overflow-x-auto p-4 md:p-6">
          <SortableContext
            items={columnIds}
            strategy={horizontalListSortingStrategy}
          >
            {columns.map((col, i) => (
              <BoardColumn
                key={col.id}
                col={col}
                canDelete={columns.length > 1}
                tickets={grouped[col.id] ?? []}
                projectId={projectId}
                index={i}
                total={columns.length}
                onEditRequest={() => setDialog({ mode: "edit", column: col })}
                onDelete={() =>
                  removeColumn(
                    col.id,
                    columnIds.find((c) => c !== col.id) ?? firstColumnId,
                  )
                }
                onMove={(dir) => {
                  const next = arrayMove(columnIds, i, i + dir)
                  reorderColumns(next)
                }}
                onArchiveAll={() => {
                  const term =
                    columns.find((c) => c.terminal)?.id ?? columnIds.at(-1)!
                  bulkMove(
                    (grouped[col.id] ?? []).map((t) => t.id),
                    term,
                  )
                }}
                onRemoveAll={() => setConfirmClear(col)}
              />
            ))}
          </SortableContext>
          <button
            onClick={() => setDialog({ mode: "add" })}
            className="flex h-fit w-64 shrink-0 items-center gap-2 self-start rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/30 hover:text-foreground"
          >
            <Plus className="size-4" />
            Add column
          </button>
        </div>
        <DragOverlay>
          {activeTicket ? (
            <KanbanCard ticket={activeTicket} overlay />
          ) : activeColumn ? (
            <div className="w-72 rounded-xl bg-muted/60 p-3 text-sm font-medium shadow-lg ring-1 ring-foreground/10">
              {activeColumn.label}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ColumnDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        column={dialog?.mode === "edit" ? dialog.column : undefined}
        onSubmit={(value) => {
          if (dialog?.mode === "edit") {
            updateColumn(dialog.column.id, value)
          } else {
            void addColumn(value.label, value.description, value.dot).catch(
              (e) => console.error(e),
            )
          }
        }}
      />

      <ConfirmDialog
        open={confirmClear !== null}
        onOpenChange={(o) => !o && setConfirmClear(null)}
        title={`Remove all cards in "${confirmClear?.label}"?`}
        description={`This permanently deletes ${
          confirmClear ? (grouped[confirmClear.id]?.length ?? 0) : 0
        } ticket(s). This can't be undone.`}
        confirmLabel="Remove all"
        onConfirm={() => {
          if (confirmClear) {
            deleteTickets((grouped[confirmClear.id] ?? []).map((t) => t.id))
          }
        }}
      />
    </>
  )
}
