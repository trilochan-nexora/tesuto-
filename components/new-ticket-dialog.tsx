"use client"

import { CircleDot, Columns3, Flag, FolderGit2, UserRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { isEmptyHtml, RichTextEditor } from "@/components/rich-text-editor"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { useStore } from "@/lib/store"
import {
  columnMeta,
  type IssueType,
  PRIORITY_META,
  PRIORITY_ORDER,
  type TicketPriority,
  TYPE_META,
} from "@/lib/types"

const PILL =
  "flex h-8 items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-xs font-medium text-foreground hover:bg-muted"

export function NewTicketDialog({
  trigger,
  defaultProjectId,
  defaultStatus,
  defaultParentId,
}: {
  trigger: React.ReactNode
  defaultProjectId?: string
  defaultStatus?: string
  defaultParentId?: string
}) {
  const { projects, users, columns, addTicket } = useStore()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  // projects/columns can be empty in a brand-new workspace — fall back to ""
  // rather than crash on projects[0].id; submit() below refuses to proceed
  // without a real selection.
  const [projectId, setProjectId] = useState(
    defaultProjectId ?? projects[0]?.id ?? "",
  )
  const [status, setStatus] = useState(defaultStatus ?? columns[0]?.id ?? "")
  const [type, setType] = useState<IssueType>("bug")
  const [priority, setPriority] = useState<TicketPriority>("medium")
  const [assigneeId, setAssigneeId] = useState("unassigned")
  const [createMore, setCreateMore] = useState(false)

  const project = projects.find((p) => p.id === projectId)
  const activeUsers = users.filter((u) => u.active)

  function reset() {
    setTitle("")
    setDescription("")
    setType("bug")
    setPriority("medium")
    setAssigneeId("unassigned")
    setStatus(defaultStatus ?? columns[0]?.id ?? "")
  }

  async function submit() {
    if (!title.trim()) {
      toast.error("A title is required.")
      return
    }
    if (!projectId || !status) {
      toast.error("Create a project first.")
      return
    }
    let ticket: Awaited<ReturnType<typeof addTicket>>
    try {
      ticket = await addTicket({
        title: title.trim(),
        description: isEmptyHtml(description) ? undefined : description,
        projectId,
        status,
        type,
        priority,
        parentId: defaultParentId,
        assigneeId: assigneeId === "unassigned" ? undefined : assigneeId,
      })
    } catch (err) {
      toast.error("Couldn't create the ticket")
      console.error(err)
      return
    }
    toast.success(`Created ${ticket.key}`, {
      action: {
        label: "Open",
        onClick: () => router.push(`/tickets/${ticket.id}`),
      },
    })
    reset()
    if (!createMore) setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {defaultParentId ? "Add a sub-ticket to" : "Create new issue in"}{" "}
            {project?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label htmlFor="nt-title" className="text-sm font-semibold">
            Add a title <span className="text-destructive">*</span>
          </label>
          <Input
            id="nt-title"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Add a description</span>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="Type your description here…"
            minHeight={150}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Select
            value={assigneeId}
            onValueChange={(v) => v && setAssigneeId(v)}
          >
            <SelectTrigger className={PILL}>
              <UserRound className="size-3.5" />
              {assigneeId === "unassigned"
                ? "Assignee"
                : users.find((u) => u.id === assigneeId)?.name}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {activeUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            value={type}
            onValueChange={(v) => v && setType(v as IssueType)}
          >
            <SelectTrigger className={PILL}>
              <CircleDot className="size-3.5" />
              {TYPE_META[type].label}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(Object.keys(TYPE_META) as IssueType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_META[t].label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            value={priority}
            onValueChange={(v) => v && setPriority(v as TicketPriority)}
          >
            <SelectTrigger className={PILL}>
              <Flag className="size-3.5" />
              {PRIORITY_META[priority].label}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PRIORITY_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => v && setStatus(v)}>
            <SelectTrigger className={PILL}>
              <Columns3 className="size-3.5" />
              {columnMeta(status, columns).label}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {columns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
            <SelectTrigger className={PILL}>
              <FolderGit2 className="size-3.5" />
              {project?.name}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={createMore}
              onChange={(e) => setCreateMore(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            Create more
          </label>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
