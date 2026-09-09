"use client"

import {
  Bold,
  Code,
  Heading,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
} from "lucide-react"
import { useRef, useState } from "react"
import { MarkdownLite } from "@/components/markdown-lite"
import { cn } from "@/lib/utils"

type Tab = "write" | "preview"

/**
 * A GitHub-style Markdown editor: Write / Preview tabs and a formatting
 * toolbar that wraps or line-prefixes the current textarea selection.
 * Used for ticket descriptions and the requirements document editor.
 */
export function MarkdownField({
  value,
  onChange,
  placeholder = "Type here…",
  rows = 8,
  className,
  autoFocus,
  fill = false,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
  className?: string
  autoFocus?: boolean
  /** grow to fill the parent instead of a fixed `rows` height */
  fill?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [tab, setTab] = useState<Tab>("write")

  function surround(before: string, after = before) {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const sel = value.slice(s, e) || ""
    const next = value.slice(0, s) + before + sel + after + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = s + before.length
      el.selectionEnd = e + before.length
    })
  }

  function linePrefix(prefix: string | ((i: number) => string)) {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const lineStart = value.lastIndexOf("\n", s - 1) + 1
    const lineEnd =
      value.indexOf("\n", e) === -1 ? value.length : value.indexOf("\n", e)
    const block = value.slice(lineStart, lineEnd)
    const next =
      value.slice(0, lineStart) +
      block
        .split("\n")
        .map(
          (line, i) => (typeof prefix === "string" ? prefix : prefix(i)) + line,
        )
        .join("\n") +
      value.slice(lineEnd)
    onChange(next)
    requestAnimationFrame(() => el.focus())
  }

  function runTool(cmd: string) {
    switch (cmd) {
      case "h":
        return linePrefix("## ")
      case "b":
        return surround("**")
      case "i":
        return surround("*")
      case "quote":
        return linePrefix("> ")
      case "code":
        return surround("`")
      case "link":
        return surround("[", "](url)")
      case "ul":
        return linePrefix("- ")
      case "ol":
        return linePrefix((i) => `${i + 1}. `)
      case "task":
        return linePrefix("- [ ] ")
    }
  }

  const tools: { icon: typeof Bold; label: string; cmd: string }[] = [
    { icon: Heading, label: "Heading", cmd: "h" },
    { icon: Bold, label: "Bold", cmd: "b" },
    { icon: Italic, label: "Italic", cmd: "i" },
    { icon: Quote, label: "Quote", cmd: "quote" },
    { icon: Code, label: "Code", cmd: "code" },
    { icon: Link2, label: "Link", cmd: "link" },
    { icon: List, label: "Bulleted list", cmd: "ul" },
    { icon: ListOrdered, label: "Numbered list", cmd: "ol" },
    { icon: ListChecks, label: "Task list", cmd: "task" },
  ]

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-input",
        fill && "min-h-0 flex-1",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-input px-1.5 pt-1.5">
        <div className="flex gap-1 text-sm">
          {(["write", "preview"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-t-md px-2.5 py-1.5 text-sm capitalize",
                tab === t
                  ? "bg-background font-medium ring-1 ring-inset ring-input"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "write" ? (
          <div className="ml-auto flex flex-wrap items-center gap-0.5 pb-1">
            {tools.map((tool) => (
              <button
                key={tool.label}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                onClick={() => runTool(tool.cmd)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <tool.icon className="size-4" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {tab === "write" ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={fill ? undefined : rows}
          autoFocus={autoFocus}
          className={cn(
            "block w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground",
            fill ? "flex-1 resize-none" : "resize-y",
          )}
        />
      ) : (
        <div
          className={cn(
            "px-3 py-2.5",
            fill ? "flex-1 overflow-y-auto" : "min-h-[8rem]",
          )}
        >
          {value.trim() ? (
            <MarkdownLite content={value} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to preview yet.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
