"use client"

import { FileText, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export function DocRail({ activeId }: { activeId?: string }) {
  const { docs, getProject, addDoc } = useStore()
  const router = useRouter()
  const [q, setQ] = useState("")

  const filtered = docs
    .filter((d) => d.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title))

  async function create() {
    try {
      const doc = await addDoc({ title: "Untitled" })
      router.push(`/sprints/${doc.id}`)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
      <div className="flex items-center gap-2 border-b p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm outline-none focus-visible:border-ring"
          />
        </div>
        <button
          onClick={create}
          aria-label="New document"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No documents match.
          </p>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((doc) => {
              const project = getProject(doc.projectId)
              return (
                <li key={doc.id}>
                  <Link
                    href={`/sprints/${doc.id}`}
                    className={cn(
                      "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      activeId === doc.id
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{doc.title}</span>
                      {project ? (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {project.name}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
