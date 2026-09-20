"use client"

import {
  ArrowUpRight,
  ExternalLink,
  Monitor,
  Plus,
  TriangleAlert,
} from "lucide-react"
import Link from "next/link"
import { notFound, useRouter } from "next/navigation"
import { use, useState } from "react"
import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { GithubIcon } from "@/components/icons"
import { NewTicketDialog } from "@/components/new-ticket-dialog"
import {
  isEmptyHtml,
  RichText,
  RichTextEditor,
} from "@/components/rich-text-editor"
import { ScreenshotEditor } from "@/components/screenshot-editor"
import {
  PriorityBadge,
  RelativeTime,
  StatusBadge,
  TypeIcon,
  UserAvatar,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { formatDuration, hoursBetween } from "@/lib/analytics"
import { useStore } from "@/lib/store"
import {
  columnMeta,
  PRIORITY_META,
  PRIORITY_ORDER,
  type TicketPriority,
  TYPE_META,
} from "@/lib/types"
import { cn, formatDate } from "@/lib/utils"

const EVENT_LABEL: Record<string, string> = {
  created: "reported",
  assigned: "assigned",
  unassigned: "unassigned",
  status: "moved",
  synced: "synced to GitHub",
}

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const {
    getTicket,
    getProject,
    getUser,
    users,
    columns,
    childrenOf,
    commentsFor,
    addComment,
    updateTicket,
    moveTicket,
    syncToGithub,
    currentUser,
    githubConnected,
    integrations,
  } = useStore()

  const githubSyncOff = !integrations.githubSync.enabled

  const router = useRouter()
  const ticket = getTicket(id)
  const [draft, setDraft] = useState("")
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState("")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")

  if (!ticket) notFound()

  const project = getProject(ticket.projectId)
  const reporter = getUser(ticket.reporterId)
  const parent = ticket.parentId ? getTicket(ticket.parentId) : undefined
  const subtickets = childrenOf(ticket.id)
  const subDone = subtickets.filter((t) => !!t.resolvedAt).length
  const thread = commentsFor(ticket.id)
  const ctx = ticket.context
  const events = ticket.events ?? []

  function postComment() {
    const body = draft.trim()
    if (!body) return
    addComment(ticket!.id, body)
    setDraft("")
  }

  function handleSync() {
    if (githubSyncOff) {
      toast.error("GitHub sync is off", {
        description: "An admin can enable it in Settings → Integrations.",
      })
      return
    }
    if (!githubConnected) {
      toast.error("Connect your GitHub account first", {
        description: "Settings → Connections",
        action: {
          label: "Open settings",
          onClick: () => router.push("/settings"),
        },
      })
      return
    }
    if (!project?.githubRepo) {
      toast.error(`Set a GitHub repo for ${project?.name ?? "this project"}`, {
        description: "The sync needs a target repository.",
        action: {
          label: "Project settings",
          onClick: () => router.push(`/projects/${project?.id}/settings`),
        },
      })
      return
    }
    syncToGithub(ticket!.id)
      .then(() =>
        toast.success("Issue created on GitHub", {
          description: `${project.name} · opened as ${currentUser.name}`,
        }),
      )
      .catch(() => {})
  }

  return (
    <>
      <AppHeader title={ticket.key} description={ticket.title} />

      <div className="w-full p-4 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {/* Main column */}
          <div className="flex min-w-0 flex-col gap-8">
            <div className="flex flex-col gap-3">
              {parent ? (
                <Link
                  href={`/tickets/${parent.id}`}
                  className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <TypeIcon type={parent.type} />
                  {parent.key} · {parent.title}
                </Link>
              ) : null}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TypeIcon type={ticket.type} />
                <span>{TYPE_META[ticket.type].label}</span>
                <span aria-hidden>·</span>
                <Link
                  href={`/projects/${ticket.projectId}`}
                  className="hover:text-foreground"
                >
                  {project?.name}
                </Link>
                <span aria-hidden>·</span>
                <span>
                  opened <RelativeTime iso={ticket.createdAt} />
                </span>
              </div>
              {editingTitle ? (
                <Textarea
                  autoFocus
                  rows={1}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      const t = titleDraft.trim()
                      if (t) updateTicket(ticket.id, { title: t })
                      setEditingTitle(false)
                    }
                    if (e.key === "Escape") setEditingTitle(false)
                  }}
                  onBlur={() => {
                    const t = titleDraft.trim()
                    if (t && t !== ticket.title) {
                      updateTicket(ticket.id, { title: t })
                    }
                    setEditingTitle(false)
                  }}
                  className="min-h-0 max-w-[68ch] resize-none py-1 text-2xl font-semibold tracking-tight"
                />
              ) : (
                <h1
                  className="-mx-1 cursor-text text-pretty rounded px-1 text-2xl font-semibold tracking-tight hover:bg-muted/50"
                  title="Click to edit"
                  onClick={() => {
                    setTitleDraft(ticket.title)
                    setEditingTitle(true)
                  }}
                >
                  {ticket.title}
                </h1>
              )}
            </div>

            {editingDesc ? (
              <div className="flex max-w-[68ch] flex-col gap-2">
                <RichTextEditor
                  value={descDraft}
                  onChange={setDescDraft}
                  minHeight={140}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingDesc(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      updateTicket(ticket.id, {
                        description: isEmptyHtml(descDraft)
                          ? undefined
                          : descDraft,
                      })
                      setEditingDesc(false)
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="group/desc flex flex-col gap-2">
                {ticket.description ? (
                  <RichText
                    html={ticket.description}
                    className="max-w-[68ch]"
                  />
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No description was captured with this report.
                  </p>
                )}
                <button
                  onClick={() => {
                    setDescDraft(ticket.description ?? "")
                    setEditingDesc(true)
                  }}
                  className="w-fit text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/desc:opacity-100"
                >
                  {ticket.description
                    ? "Edit description"
                    : "Add a description"}
                </button>
              </div>
            )}

            {ticket.screenshotUrl ? (
              <section className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Screenshot
                  {ticket.annotations?.length ? (
                    <span className="font-normal normal-case tracking-normal">
                      · {ticket.annotations.length} annotation
                      {ticket.annotations.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </h2>
                <ScreenshotEditor
                  src={ticket.screenshotUrl}
                  annotations={ticket.annotations ?? []}
                  onChange={(next) =>
                    updateTicket(ticket.id, { annotations: next })
                  }
                  editable
                />
              </section>
            ) : null}

            {ticket.recordingUrl ? (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Screen recording
                </h2>
                {/* biome-ignore lint/a11y/useMediaCaption: user-captured bug clip, no captions exist */}
                <video
                  src={ticket.recordingUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-lg border border-input bg-black"
                />
              </section>
            ) : null}

            {ticket.domSnapshot || ticket.sourceUrl ? (
              <section className="flex flex-col gap-3 rounded-xl bg-muted/40 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Where it happened
                </h2>
                {ticket.sourceUrl ? (
                  <a
                    href={ticket.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    {ticket.sourceUrl}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
                {ticket.domSnapshot ? (
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 font-mono text-xs">
                    <dt className="text-muted-foreground">selector</dt>
                    <dd className="truncate">{ticket.domSnapshot.selector}</dd>
                    <dt className="text-muted-foreground">element</dt>
                    <dd>&lt;{ticket.domSnapshot.tag}&gt;</dd>
                    {ticket.domSnapshot.text ? (
                      <>
                        <dt className="text-muted-foreground">text</dt>
                        <dd className="truncate">
                          “{ticket.domSnapshot.text}”
                        </dd>
                      </>
                    ) : null}
                    {ticket.domSnapshot.rect ? (
                      <>
                        <dt className="text-muted-foreground">size</dt>
                        <dd>
                          {ticket.domSnapshot.rect.width}×
                          {ticket.domSnapshot.rect.height}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                ) : null}
              </section>
            ) : null}

            {ctx &&
            (ctx.browser ||
              ctx.consoleErrors?.length ||
              ctx.failedRequests?.length) ? (
              <section className="flex flex-col gap-3 rounded-xl bg-muted/40 p-4">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Monitor className="size-3.5" />
                  Session context
                </h2>
                {ctx.browser ? (
                  <p className="text-sm text-muted-foreground">
                    {[ctx.browser, ctx.os, ctx.viewport]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </p>
                ) : null}
                {ctx.consoleErrors?.length ? (
                  <div className="flex flex-col gap-1">
                    {ctx.consoleErrors.map((line) => (
                      <code
                        key={line}
                        className="flex items-start gap-2 rounded-md bg-destructive/10 px-2.5 py-1.5 font-mono text-xs text-destructive"
                      >
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                        <span className="whitespace-pre-wrap">{line}</span>
                      </code>
                    ))}
                  </div>
                ) : null}
                {ctx.failedRequests?.length ? (
                  <div className="flex flex-col gap-1">
                    {ctx.failedRequests.map((line) => (
                      <code
                        key={line}
                        className="rounded-md bg-background px-2.5 py-1.5 font-mono text-xs text-foreground/80 ring-1 ring-foreground/10"
                      >
                        {line}
                      </code>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            <Separator />

            {/* Discussion / Activity / Sub-tickets */}
            <Tabs defaultValue="discussion">
              <TabsList>
                <TabsTrigger value="discussion">
                  Discussion
                  {thread.length > 0 ? (
                    <span className="ml-1.5 text-muted-foreground">
                      {thread.length}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="subtickets">
                  Sub-tickets
                  {subtickets.length > 0 ? (
                    <span className="ml-1.5 text-muted-foreground">
                      {subDone}/{subtickets.length}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent
                value="discussion"
                className="flex flex-col gap-5 pt-5"
              >
                {thread.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No comments yet. Add the first note about this ticket.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-5">
                    {thread.map((comment) => {
                      const author = getUser(comment.authorId)
                      return (
                        <li key={comment.id} className="flex gap-3">
                          <UserAvatar user={author} className="mt-0.5 size-7" />
                          <div className="flex min-w-0 flex-col gap-1">
                            <div className="flex items-baseline gap-2 text-sm">
                              <span className="font-medium">
                                {author?.name ?? "Unknown"}
                              </span>
                              <RelativeTime
                                iso={comment.createdAt}
                                className="text-xs text-muted-foreground"
                              />
                            </div>
                            <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-foreground/90">
                              {comment.body}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <div className="flex gap-3">
                  <UserAvatar user={currentUser} className="mt-0.5 size-7" />
                  <div className="flex flex-1 flex-col items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Leave a comment…"
                      rows={3}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                          postComment()
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={postComment}
                      disabled={!draft.trim()}
                    >
                      Comment
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="subtickets"
                className="flex flex-col gap-3 pt-5"
              >
                {subtickets.length > 0 ? (
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{
                          width: `${subtickets.length ? (subDone / subtickets.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {subDone}/{subtickets.length}
                    </span>
                  </div>
                ) : null}

                <ul className="flex flex-col">
                  {subtickets.map((sub) => (
                    <li
                      key={sub.id}
                      className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={!!sub.resolvedAt}
                        onChange={(e) =>
                          moveTicket(
                            sub.id,
                            e.target.checked
                              ? (columns.find((c) => c.terminal)?.id ??
                                  columns.at(-1)!.id)
                              : columns[0].id,
                            sub.order,
                          )
                        }
                        className="size-4 shrink-0 rounded border-input accent-primary"
                      />
                      <TypeIcon type={sub.type} />
                      <Link
                        href={`/tickets/${sub.id}`}
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          sub.resolvedAt &&
                            "text-muted-foreground line-through",
                        )}
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {sub.key}
                        </span>{" "}
                        {sub.title}
                      </Link>
                      <PriorityBadge priority={sub.priority} />
                      <UserAvatar
                        user={getUser(sub.assigneeId)}
                        className="size-5"
                      />
                    </li>
                  ))}
                </ul>

                <NewTicketDialog
                  defaultProjectId={ticket.projectId}
                  defaultParentId={ticket.id}
                  trigger={
                    <Button variant="outline" size="sm" className="w-fit">
                      <Plus data-icon="inline-start" />
                      Add sub-ticket
                    </Button>
                  }
                />
              </TabsContent>

              <TabsContent
                value="activity"
                className="flex flex-col gap-4 pt-5"
              >
                <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      Time to assign
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatDuration(
                        hoursBetween(ticket.createdAt, ticket.assignedAt),
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      Held by assignee
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatDuration(
                        hoursBetween(
                          ticket.assignedAt,
                          ticket.resolvedAt ?? new Date().toISOString(),
                        ),
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      {ticket.resolvedAt ? "Total resolution" : "Open for"}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatDuration(
                        hoursBetween(
                          ticket.createdAt,
                          ticket.resolvedAt ?? new Date().toISOString(),
                        ),
                      )}
                    </span>
                  </div>
                </div>
                {events.length ? (
                  <ol className="flex flex-col gap-2.5 border-l pl-4">
                    {[...events].reverse().map((event, i) => {
                      const actor = getUser(event.actorId)
                      const toLabel =
                        event.kind === "status" && event.to
                          ? columnMeta(event.to, columns).label
                          : event.kind === "assigned"
                            ? getUser(event.to)?.name
                            : null
                      return (
                        <li
                          key={i}
                          className="relative text-sm text-muted-foreground before:absolute before:-left-[1.3rem] before:top-1.5 before:size-2 before:rounded-full before:bg-border"
                        >
                          <span className="text-foreground">
                            {actor?.name ?? "Someone"}
                          </span>{" "}
                          {EVENT_LABEL[event.kind] ?? event.kind}
                          {toLabel ? (
                            <>
                              {" to "}
                              <span className="text-foreground">{toLabel}</span>
                            </>
                          ) : null}
                          {" · "}
                          <RelativeTime iso={event.at} />
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No activity recorded.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <aside className="flex flex-col gap-6 lg:border-l lg:pl-8">
            <SideField label="Status">
              <Select
                value={ticket.status}
                onValueChange={(v) =>
                  v && updateTicket(ticket.id, { status: v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => columnMeta(v, columns).label}
                  </SelectValue>
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
            </SideField>

            <SideField label="Priority">
              <Select
                value={ticket.priority}
                onValueChange={(v) =>
                  v &&
                  updateTicket(ticket.id, { priority: v as TicketPriority })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => PRIORITY_META[v as TicketPriority].label}
                  </SelectValue>
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
            </SideField>

            <SideField label="Assignee">
              <Select
                value={ticket.assigneeId ?? "unassigned"}
                onValueChange={(v) =>
                  updateTicket(ticket.id, {
                    assigneeId: v && v !== "unassigned" ? v : undefined,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) =>
                      v === "unassigned"
                        ? "Unassigned"
                        : users.find((u) => u.id === v)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users
                      .filter((u) => u.active)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </SideField>

            <Separator />

            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">State</dt>
                <dd>
                  <StatusBadge status={ticket.status} />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Urgency</dt>
                <dd>
                  <PriorityBadge priority={ticket.priority} />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Reporter</dt>
                <dd className="flex items-center gap-2">
                  <UserAvatar user={reporter} className="size-5" />
                  <span>{reporter?.name ?? "Unknown"}</span>
                </dd>
              </div>
              {ticket.assignedAt ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Assigned</dt>
                  <dd>
                    <RelativeTime iso={ticket.assignedAt} />
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Updated</dt>
                <dd>
                  <RelativeTime iso={ticket.updatedAt} />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(ticket.createdAt)}</dd>
              </div>
            </dl>

            <Separator />

            <div className="flex flex-col gap-2">
              {ticket.githubIssueUrl ? (
                <a
                  href={ticket.githubIssueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    <GithubIcon className="size-4" />
                    View on GitHub
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </a>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSync}
                  disabled={githubSyncOff}
                >
                  <GithubIcon data-icon="inline-start" />
                  Sync to GitHub
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {githubSyncOff ? (
                  "GitHub sync is disabled — an admin can turn it on in Settings → Integrations."
                ) : (
                  <>
                    Creates an issue in{" "}
                    <code className="text-xs">
                      {project?.githubRepo ?? "…"}
                    </code>{" "}
                    under your own GitHub account. The board stays the source of
                    truth.
                  </>
                )}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

function SideField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
