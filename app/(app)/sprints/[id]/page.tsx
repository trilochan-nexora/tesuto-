"use client"

import { Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import Link from "next/link"
import { notFound, useRouter } from "next/navigation"
import { use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { DocRail } from "@/components/doc-rail"
import { MarkdownField } from "@/components/markdown-field"
import { MarkdownLite } from "@/components/markdown-lite"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStore } from "@/lib/store"
import type { Doc } from "@/lib/types"
import { formatRelativeTime } from "@/lib/utils"

export default function DocPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { getDoc } = useStore()
  const doc = getDoc(id)

  if (!doc) notFound()

  return (
    <>
      <AppHeader title={doc.title} description="Sprints" />
      <div className="flex h-[calc(100svh-3.5rem)] overflow-hidden">
        <DocRail activeId={doc.id} />
        {/* keyed so local edit state resets when you switch documents */}
        <DocEditor key={doc.id} doc={doc} />
      </div>
    </>
  )
}

function DocEditor({ doc }: { doc: Doc }) {
  const { docs, getUser, projects, updateDoc, deleteDoc } = useStore()
  const router = useRouter()

  const [title, setTitle] = useState(doc.title)
  const [content, setContent] = useState(doc.content)
  const [mode, setMode] = useState<"write" | "read">(
    doc.content.trim() ? "read" : "write",
  )

  // Debounced autosave.
  useEffect(() => {
    if (title === doc.title && content === doc.content) return
    const t = setTimeout(() => {
      updateDoc(doc.id, { title: title.trim() || "Untitled", content })
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content])

  const byTitle = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of docs) map.set(d.title.toLowerCase(), d.id)
    return map
  }, [docs])

  const backlinks = useMemo(() => {
    const needle = `[[${doc.title}]]`.toLowerCase()
    return docs.filter(
      (d) => d.id !== doc.id && d.content.toLowerCase().includes(needle),
    )
  }, [docs, doc.id, doc.title])

  const author = getUser(doc.authorId)

  function resolveWikiLink(t: string) {
    const target = byTitle.get(t.toLowerCase())
    return target ? `/sprints/${target}` : null
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b px-6 py-2.5">
        <Select
          value={doc.projectId ?? "none"}
          onValueChange={(v) =>
            updateDoc(doc.id, { projectId: v && v !== "none" ? v : undefined })
          }
        >
          <SelectTrigger className="h-7 text-xs" size="sm">
            <SelectValue>
              {(v: string) =>
                v === "none"
                  ? "No project"
                  : projects.find((p) => p.id === v)?.name
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="none">No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {author?.name} · edited {formatRelativeTime(doc.updatedAt)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode(mode === "read" ? "write" : "read")}
          >
            {mode === "read" ? (
              <>
                <Pencil data-icon="inline-start" />
                Edit
              </>
            ) : (
              <>
                <Eye data-icon="inline-start" />
                Preview
              </>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon">
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => {
                  deleteDoc(doc.id)
                  toast.success("Document deleted")
                  router.push("/sprints")
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col gap-4 px-6 py-6 md:px-10 md:py-8">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="shrink-0 bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
        />

        {mode === "write" ? (
          <MarkdownField
            value={content}
            onChange={setContent}
            placeholder={"Type / for blocks · [[doc title]] links · # - > [] auto-format • markdown works too"}
            fill
          />
        ) : content.trim() ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MarkdownLite content={content} resolveWikiLink={resolveWikiLink} />
          </div>
        ) : (
          <button
            onClick={() => setMode("write")}
            className="w-fit text-sm text-muted-foreground hover:text-foreground"
          >
            This document is empty — click to start writing.
          </button>
        )}

        {backlinks.length > 0 ? (
          <div className="mt-2 flex shrink-0 flex-col gap-2 border-t pt-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Linked from
            </h2>
            <ul className="flex flex-col gap-1">
              {backlinks.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/sprints/${d.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
