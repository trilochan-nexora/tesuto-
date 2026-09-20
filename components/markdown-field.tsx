"use client"

import {
  Bold,
  Check,
  Code,
  Heading,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
} from "lucide-react"
import type * as React from "react"
import { useRef, useState } from "react"
import { MarkdownLite } from "@/components/markdown-lite"
import { cn } from "@/lib/utils"

type Tab = "write" | "preview"

type BlockDef = {
  id:
    | "text"
    | "h1"
    | "h2"
    | "h3"
    | "ul"
    | "ol"
    | "task"
    | "quote"
    | "code"
    | "divider"
    | "wikilink"
  label: string
  desc: string
  icon: typeof Pilcrow
}

const BLOCKS: BlockDef[] = [
  { id: "text", label: "Text", desc: "Plain text", icon: Pilcrow },
  { id: "h1", label: "Heading 1", desc: "Large section heading", icon: Heading },
  { id: "h2", label: "Heading 2", desc: "Medium section heading", icon: Heading },
  { id: "h3", label: "Heading 3", desc: "Small section heading", icon: Heading },
  { id: "ul", label: "Bulleted list", desc: "Simple bullet list", icon: List },
  {
    id: "ol",
    label: "Numbered list",
    desc: "Automatically increments",
    icon: ListOrdered,
  },
  { id: "task", label: "To-do list", desc: "Track tasks with checkboxes", icon: ListChecks },
  { id: "quote", label: "Quote", desc: "Capture a citation", icon: Quote },
  { id: "code", label: "Code block", desc: "Fenced code snippet", icon: Code },
  { id: "divider", label: "Divider", desc: "Horizontal line", icon: Minus },
  { id: "wikilink", label: "Link a doc", desc: "[[Document title]]", icon: Link2 },
]

type SlashMenu = {
  /** index of the "/" that opened the menu */
  at: number
  query: string
  highlight: number
}

function currentLine(v: string, caret: number) {
  const start = v.lastIndexOf("\n", caret - 1) + 1
  const endIdx = v.indexOf("\n", caret)
  const end = endIdx === -1 ? v.length : endIdx
  return { start, end, text: v.slice(start, end) }
}

/** Continue the numbering of a `N. ` list for the next line. */
function nextOl(v: string, lineStart: number) {
  const prevLineStart = v.lastIndexOf("\n", lineStart - 2) + 1
  const prevLineEnd = lineStart - 1
  const prev = v.slice(prevLineStart, prevLineEnd)
  const m = prev.match(/^(\s*)(\d+)[.)] /)
  return m ? Number(m[2]) + 1 : 1
}

/**
 * Notion-flavoured markdown editor. Write / Preview tabs; a formatting
 * toolbar; `/` slash menu with block types; markdown auto-format while
 * typing (`# `, `- `, `> `, `[] `…); Enter/Backspace that continue and
 * unwrap list prefixes; Cmd/Ctrl+B/I/E and Tab/Shift+Tab indent.
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
  const mirrorRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<Tab>("write")
  const [menu, setMenu] = useState<SlashMenu | null>(null)

  const el = ref.current

  function moveCaret(pos: number) {
    const ta = ref.current
    if (!ta) return
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = Math.min(pos, ta.value.length)
    })
  }

  function surround(before: string, after = before) {
    const ta = ref.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const sel = value.slice(s, e) || ""
    const next = value.slice(0, s) + before + sel + after + value.slice(e)
    onChange(next)
    moveCaret(s + before.length + sel.length)
  }

  function linePrefix(prefix: string | ((i: number) => string)) {
    const ta = ref.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    const lineStart = value.lastIndexOf("\n", s - 1) + 1
    const endIdx = value.indexOf("\n", e)
    const lineEnd = endIdx === -1 ? value.length : endIdx
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
    moveCaret(s)
  }

  // ---- slash menu ---------------------------------------------------------

  function updateQuery(ta: HTMLTextAreaElement) {
    setMenu((m) => {
      if (!m) return m
      if (ta.value[m.at] !== "/" || ta.selectionStart <= m.at) return null
      const query = ta.value.slice(m.at + 1, ta.selectionStart)
      if (query.includes("\n")) return null
      return { ...m, query: query.slice(0, 24), highlight: 0 }
    })
  }

  function filteredBlocks(query: string) {
    const q = query.toLowerCase()
    return BLOCKS.filter(
      (b) => !q || b.label.toLowerCase().includes(q) || b.id.includes(q),
    )
  }

  function closeMenu() {
    setMenu(null)
  }

  function commitBlock(def: BlockDef) {
    const ta = ref.current
    if (!ta) return
    const m = menu
    closeMenu()
    if (!m) return

    const s = ta.selectionStart
    const { start: lineStart, end: lineEnd } = currentLine(value, s)
    const head = value.slice(0, lineStart)
    const tail = value.slice(lineEnd)
    const pre = value.slice(lineStart, m.at)
    const post = value.slice(s, lineEnd)
    const trimmedPre = pre.trimStart()

    const PREFIX: Record<BlockDef["id"], string> = {
      text: "",
      h1: "# ",
      h2: "## ",
      h3: "### ",
      ul: "- ",
      ol: `${nextOl(value, lineStart)}. `,
      task: "- [ ] ",
      quote: "> ",
      code: "",
      divider: "",
      wikilink: "",
    }

    let next: string
    let caret: number

    if (def.id === "divider") {
      next = head + "---" + tail
      caret = lineStart + 3
    } else if (def.id === "code") {
      next = head + "```\n" + post + "\n```" + tail
      caret = lineStart + 4
    } else if (def.id === "wikilink") {
      next = head + trimmedPre + "[[]]" + post + tail
      caret = lineStart + trimmedPre.length + 2
    } else {
      next = head + PREFIX[def.id] + trimmedPre + post + tail
      caret = lineStart + PREFIX[def.id].length + trimmedPre.length
    }
    onChange(next)
    moveCaret(caret)
  }

  function caretPoint(ta: HTMLTextAreaElement) {
    const mirror = mirrorRef.current
    if (!mirror) return null
    const s = Math.min(ta.selectionStart, ta.value.length)
    mirror.textContent = ta.value.slice(0, s)
    const mark = document.createElement("span")
    mark.textContent = "\u200b"
    mirror.appendChild(mark)
    const x = mark.offsetLeft
    const y = mark.offsetTop
    mirror.textContent = ""
    return { x, y }
  }

  // ---- key handling -------------------------------------------------------

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    const s = ta.selectionStart

    // Shortcuts first.
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const key = e.key.toLowerCase()
      if (key === "b") return void (e.preventDefault(), surround("**"))
      if (key === "i") return void (e.preventDefault(), surround("*"))
      if (key === "e") return void (e.preventDefault(), surround("`"))
    }

    if (menu) {
      const filtered = filteredBlocks(menu.query)
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMenu((m) =>
          m ? { ...m, highlight: (m.highlight + 1) % Math.max(filtered.length, 1) } : m,
        )
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setMenu((m) =>
          m
            ? {
                ...m,
                highlight:
                  (m.highlight - 1 + filtered.length) % filtered.length,
              }
            : m,
        )
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        const pick = filtered[menu.highlight]
        if (pick) commitBlock(pick)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        closeMenu()
        return
      }
      if (e.key === " ") {
        // A space commits the highlighted block, like Notion.
        e.preventDefault()
        const pick = filtered[menu.highlight]
        if (pick) commitBlock(pick)
        return
      }
    }

    if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
      setMenu({ at: s, query: "", highlight: 0 })
      return
    }

    const line = currentLine(value, s)

    // Typing a space right after a bare block marker auto-formats the line.
    if (e.key === " ") {
      const typed = value.slice(line.start, s)
      const rules: [RegExp, (m: string) => string][] = [
        [/^#{1,3}$/, (m) => `${m} `],
        [/^[-*]$/, () => "- "],
        [/^>$/, () => "> "],
        [/^\[\]$/, () => "- [ ] "],
        [/^\[x\]$/, () => "- [x] "],
        [/^\d+\.$/, (m) => `${m} `],
      ]
      for (const [re, make] of rules) {
        if (re.test(typed)) {
          e.preventDefault()
          const next = value.slice(0, line.start) + make(typed) + value.slice(s)
          onChange(next)
          moveCaret(line.start + make(typed).length)
          return
        }
      }
      return
    }

    // Enter continues a list/quote line, or unwinds an empty one.
    if (e.key === "Enter") {
      const t = line.text
      const empties: [RegExp, (m: RegExpMatchArray) => string][] = [
        [/^(\s*)- \[[ x]\] $/, (m) => m[1]],
        [/^(\s*)[-*] $/, (m) => m[1]],
        [/^(\s*)\d+[.)] $/, (m) => m[1]],
        [/^(\s*)> $/, (m) => m[1]],
      ]
      for (const [re, make] of empties) {
        if (re.test(t)) {
          e.preventDefault()
          onChange(value.slice(0, line.start) + make(t.match(re)!) + value.slice(line.end))
          moveCaret(line.start + make(t.match(re)!).length)
          return
        }
      }
      const continues: [RegExp, (m: RegExpMatchArray) => string][] = [
        [/^(\s*)- \[[ x]\] .+$/, (m) => `${m[1]}- [ ] `],
        [/^(\s*)[-*] .+$/, (m) => `${m[1]}- `],
        [/^(\s*)(\d+)[.)] .+$/, (m) => `${m[1]}${Number(m[2]) + 1}. `],
        [/^(\s*)> .+$/, (m) => `${m[1]}> `],
      ]
      for (const [re, make] of continues) {
        if (re.test(t)) {
          e.preventDefault()
          const insert = make(t.match(re)!)
          onChange(value.slice(0, s) + "\n" + insert + value.slice(s))
          moveCaret(s + 1 + insert.length)
          return
        }
      }
      return
    }

    // Backspace right after a block prefix removes the whole prefix.
    if (e.key === "Backspace" && ta.selectionStart === ta.selectionEnd) {
      const pre = value.slice(line.start, s)
      const prefix = [
        /^(\s*)- \[[ x]\] $/,
        /^(\s*)[-*] $/,
        /^(\s*)\d+[.)] $/,
        /^(\s*)> $/,
        /^(\s*)#{1,3} $/,
      ].find((re) => re.test(pre))
      if (prefix) {
        e.preventDefault()
        const m = pre.match(prefix)!
        onChange(value.slice(0, line.start + m[1].length) + value.slice(line.end))
        moveCaret(line.start + m[1].length)
        return
      }
    }

    // Tab indents a list/quote line; Shift+Tab dedents it.
    if (e.key === "Tab") {
      const t = line.text
      if (/^(\s*)(- \[[ x]\] |[-*] |\d+[.)] |> )/.test(t)) {
        e.preventDefault()
        if (e.shiftKey) {
          const indent = t.match(/^(\s*)/)?.[0].length ?? 0
          if (!indent) return
          const strip = Math.min(indent, 2)
          onChange(value.slice(0, line.start) + t.slice(strip) + value.slice(line.end))
          moveCaret(line.start + Math.max(s - line.start - strip, 0))
        } else {
          onChange(value.slice(0, line.start) + "  " + t + value.slice(line.end))
          moveCaret(s + 2)
        }
        return
      }
    }
  }

  function onTextChange(next: string, ta: HTMLTextAreaElement) {
    onChange(next)
    updateQuery(ta)
  }

  // ---- toolbar ------------------------------------------------------------

  function runTool(cmd: string) {
    switch (cmd) {
      case "h1":
        return linePrefix("# ")
      case "h2":
        return linePrefix("## ")
      case "h3":
        return linePrefix("### ")
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
      case "divider": {
        const ta = ref.current
        if (!ta) return
        const s = ta.selectionStart
        onChange(value.slice(0, s) + "\n---\n" + value.slice(s))
        moveCaret(s + 5)
        return
      }
    }
  }

  const tools: { icon: typeof Bold; label: string; cmd: string }[] = [
    { icon: Heading, label: "Heading 1", cmd: "h1" },
    { icon: Heading, label: "Heading 2", cmd: "h2" },
    { icon: Heading, label: "Heading 3", cmd: "h3" },
    { icon: Bold, label: "Bold", cmd: "b" },
    { icon: Italic, label: "Italic", cmd: "i" },
    { icon: Quote, label: "Quote", cmd: "quote" },
    { icon: Code, label: "Inline code", cmd: "code" },
    { icon: Link2, label: "Link", cmd: "link" },
    { icon: List, label: "Bulleted list", cmd: "ul" },
    { icon: ListOrdered, label: "Numbered list", cmd: "ol" },
    { icon: ListChecks, label: "Task list", cmd: "task" },
    { icon: Minus, label: "Divider", cmd: "divider" },
  ]

  // ---- menu position --------------------------------------------------------

  const point = el && menu ? caretPoint(el) : null
  const filtered = menu ? filteredBlocks(menu.query) : []
  const highlight = menu
    ? Math.min(menu.highlight, Math.max(filtered.length - 1, 0))
    : 0
  const menuTop = (() => {
    if (!point || !el) return 0
    const y = point.y - el.scrollTop
    const content = Math.min(filtered.length, 8) * 34 + 24
    return y + 120 > el.getBoundingClientRect().height && y - content > 0
      ? y - content
      : y + 22
  })()

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
                key={tool.cmd}
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
        <div className={cn("relative min-h-0", fill ? "flex flex-1 flex-col" : "")}>
          <div
            ref={mirrorRef}
            aria-hidden
            className="pointer-events-none invisible absolute inset-x-0 left-0 top-0 break-words whitespace-pre-wrap px-3 py-2.5 text-sm"
          />
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onTextChange(e.target.value, e.target)}
            onKeyDown={onKeyDown}
            onSelect={() => el && updateQuery(el)}
            onBlur={() => window.setTimeout(closeMenu, 150)}
            placeholder={placeholder}
            rows={fill ? undefined : rows}
            autoFocus={autoFocus}
            className={cn(
              "block w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground",
              fill ? "h-full flex-1 resize-none overflow-y-auto" : "resize-y",
            )}
          />
          {menu && filtered.length > 0 ? (
            <div
              onPointerDown={(e) => e.preventDefault()}
              className="absolute z-50 flex max-h-72 w-64 flex-col overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
              style={{ left: point ? Math.min(Math.max(point.x, 8), 320) : 8, top: menuTop }}
            >
              {filtered.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => commitBlock(b)}
                  onPointerEnter={() => setMenu((m) => (m ? { ...m, highlight: i } : m))}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
                    i === highlight && "bg-accent text-accent-foreground",
                  )}
                >
                  <b.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{b.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {b.desc}
                    </span>
                  </span>
                  {i === highlight ? <Check className="size-3.5" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
