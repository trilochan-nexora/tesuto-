"use client"

import {
  Bold,
  Code2,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * A lightweight WYSIWYG editor (contentEditable + execCommand) for rich
 * descriptions — bold/italic, headings, lists, quotes, code, links. Emits
 * HTML. Zero dependencies; good enough for an internal tracker.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write a description…",
  minHeight = 160,
  className,
  autoFocus,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  className?: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const savedRange = useRef<Range | null>(null)

  // Seed the editable node once, and whenever the value changes from outside
  // (not from our own typing).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const incoming = toHtml(value)
    if (el.innerHTML !== incoming && document.activeElement !== el) {
      el.innerHTML = incoming
    }
  }, [value])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  function emit() {
    const el = ref.current
    if (el) onChange(el.innerHTML === "<br>" ? "" : el.innerHTML)
  }

  function exec(command: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  function applyLink() {
    const url = linkUrl.trim()
    setLinkOpen(false)
    setLinkUrl("")
    const sel = window.getSelection()
    if (savedRange.current && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    if (url)
      exec("createLink", /^https?:\/\//.test(url) ? url : `https://${url}`)
  }

  const tools = [
    { icon: Bold, label: "Bold", cmd: "bold" },
    { icon: Italic, label: "Italic", cmd: "italic" },
    { icon: Strikethrough, label: "Strikethrough", cmd: "strikeThrough" },
    { icon: Heading2, label: "Heading", cmd: "formatBlock:H2" },
    { icon: Quote, label: "Quote", cmd: "formatBlock:BLOCKQUOTE" },
    { icon: Code2, label: "Code block", cmd: "formatBlock:PRE" },
    { icon: List, label: "Bulleted list", cmd: "insertUnorderedList" },
    { icon: ListOrdered, label: "Numbered list", cmd: "insertOrderedList" },
  ]

  return (
    <div className={cn("rounded-lg border border-input", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input p-1">
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const [c, a] = tool.cmd.split(":")
              exec(c, a)
            }}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <tool.icon className="size-4" />
          </button>
        ))}
        <button
          type="button"
          title="Link"
          aria-label="Link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const sel = window.getSelection()
            savedRange.current = sel?.rangeCount
              ? sel.getRangeAt(0).cloneRange()
              : null
            setLinkOpen((o) => !o)
          }}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Link2 className="size-4" />
        </button>
      </div>

      {linkOpen ? (
        <div className="flex items-center gap-2 border-b border-input bg-muted/40 p-2">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                applyLink()
              }
              if (e.key === "Escape") setLinkOpen(false)
            }}
            placeholder="https://…"
            className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs outline-none"
          />
          <button
            type="button"
            onClick={applyLink}
            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
          >
            Apply
          </button>
        </div>
      ) : null}

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className="prose-tight block w-full overflow-y-auto px-3 py-2.5 text-sm outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:rounded-md [&_pre]:bg-muted/60 [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs [&_ul]:list-disc [&_ul]:pl-5"
        style={{ minHeight }}
      />
    </div>
  )
}

/** Render stored description HTML (or legacy plain text) for display. */
export function RichText({
  html,
  className,
}: {
  html: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "text-[0.95rem] leading-relaxed text-foreground/90 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/60 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs [&_ul]:list-disc [&>*+*]:mt-2",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: toHtml(html) }}
    />
  )
}

export function isEmptyHtml(html?: string) {
  if (!html) return true
  return html.replace(/<[^>]*>/g, "").replace(/\s|&nbsp;/g, "").length === 0
}

function toHtml(value: string) {
  if (!value) return ""
  // Already HTML.
  if (/<(p|div|h[1-6]|ul|ol|li|blockquote|pre|br|strong|em|a)\b/i.test(value)) {
    return value
  }
  // Legacy plain text → paragraphs.
  return value
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>").replace(/</g, "&lt;")}</p>`)
    .join("")
}
