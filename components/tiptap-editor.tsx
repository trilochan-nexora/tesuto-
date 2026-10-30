"use client"

import { TextBIcon, CodeIcon, CodeBlockIcon, TextHOneIcon, TextHTwoIcon, TextHThreeIcon, TextItalicIcon, LinkIcon, ListIcon, ListChecksIcon, ListNumbersIcon, MinusIcon, ParagraphIcon, QuotesIcon, TextStrikethroughIcon } from "@phosphor-icons/react"
import { Extension, type Editor } from "@tiptap/core"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { Markdown } from "@tiptap/markdown"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { EditorContent, useEditor, useEditorState } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import { Placeholder } from "@tiptap/extensions"
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion"
import { useEffect, useRef, useState } from "react"
import { sanitizeRichText } from "@/lib/sanitize"
import { cn } from "@/lib/utils"

type Command = {
  id: string
  label: string
  desc: string
  icon: typeof ParagraphIcon
  run: (editor: Editor) => void
  /** Also offered in HTML mode (i.e. allowed by `sanitizeRichText`). */
  html?: boolean
}

const COMMANDS: Command[] = [
  { id: "text", label: "Text", desc: "Plain text", icon: ParagraphIcon, run: (e) => e.chain().focus().setParagraph().run(), html: true },
  { id: "h1", label: "Heading 1", desc: "Large section heading", icon: TextHOneIcon, run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { id: "h2", label: "Heading 2", desc: "Medium section heading", icon: TextHTwoIcon, run: (e) => e.chain().focus().setHeading({ level: 2 }).run(), html: true },
  { id: "h3", label: "Heading 3", desc: "Small section heading", icon: TextHThreeIcon, run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { id: "ul", label: "Bulleted list", desc: "Simple bullet list", icon: ListIcon, run: (e) => e.chain().focus().toggleBulletList().run(), html: true },
  { id: "ol", label: "Numbered list", desc: "Automatically increments", icon: ListNumbersIcon, run: (e) => e.chain().focus().toggleOrderedList().run(), html: true },
  { id: "task", label: "To-do list", desc: "Track tasks with checkboxes", icon: ListChecksIcon, run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: "quote", label: "Quote", desc: "Capture a citation", icon: QuotesIcon, run: (e) => e.chain().focus().toggleBlockquote().run(), html: true },
  { id: "code", label: "Code block", desc: "Fenced code snippet", icon: CodeBlockIcon, run: (e) => e.chain().focus().toggleCodeBlock().run(), html: true },
  { id: "divider", label: "Divider", desc: "Horizontal line", icon: MinusIcon, run: (e) => e.chain().focus().setHorizontalRule().run() },
  {
    id: "wikilink",
    label: "Link a doc",
    desc: "[[Document title]]",
    icon: LinkIcon,
    run: (e) => {
      e.chain().focus().insertContent("[[]]").run()
      const pos = e.state.selection.from
      e.commands.setTextSelection(pos - 2)
    },
  },
]

function filterCommands(query: string, html: boolean) {
  const q = query.toLowerCase()
  return COMMANDS.filter(
    (c) =>
      (!html || c.html) &&
      (!q || c.label.toLowerCase().includes(q) || c.id.includes(q)),
  )
}

type SlashState = {
  items: Command[]
  rect: DOMRect | null
  highlight: number
  /** From the suggestion plugin: deletes the `/query` and runs the item. */
  command: (item: Command) => void
}

/**
 * `/` slash menu. The suggestion plugin drives state; the menu itself is
 * rendered by the React component through the `onState` callback.
 */
function slashCommands(
  html: boolean,
  onState: (s: SlashState | null) => void,
  onKey: (event: KeyboardEvent) => boolean,
) {
  return Extension.create({
    name: "slashCommands",
    // Ahead of list/task keymaps, so Enter picks a menu item instead of
    // splitting the list item.
    priority: 1000,
    addProseMirrorPlugins() {
      return [
        Suggestion<Command>({
          editor: this.editor,
          char: "/",
          startOfLine: false,
          items: ({ query }) => filterCommands(query, html),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run()
            props.run(editor)
          },
          render: () => {
            const push = (p: SuggestionProps<Command>) =>
              onState({
                items: p.items,
                rect: p.clientRect?.() ?? null,
                highlight: 0,
                command: p.command,
              })
            return {
              onStart: push,
              onUpdate: push,
              onKeyDown: ({ event }) => {
                if (event.key === "Escape") {
                  onState(null)
                  return true
                }
                return onKey(event)
              },
              onExit: () => onState(null),
            }
          },
        }),
      ]
    },
  })
}

/** The serializer escapes brackets; `[[wiki links]]` must stay literal. */
function toMarkdown(editor: Editor) {
  return editor
    .getMarkdown()
    .replace(/\\\[\\\[([^\n]*?)\\\]\\\]/g, "[[$1]]")
}

const WIKI_RE = /\[\[([^\]\n]+)\]\]/g

/**
 * Highlights `[[Doc title]]` references (they stay plain text in the stored
 * markdown) and opens them on Cmd/Ctrl+click.
 */
function wikiLinks(resolve: (title: string) => string | null, open: (href: string) => void) {
  return Extension.create({
    name: "wikiLinks",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("wikiLinks"),
          props: {
            decorations(state) {
              const decos: Decoration[] = []
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return
                for (const m of node.text.matchAll(WIKI_RE)) {
                  const from = pos + (m.index ?? 0)
                  const href = resolve(m[1].trim())
                  decos.push(
                    Decoration.inline(from, from + m[0].length, {
                      class: href ? "wiki-link" : "wiki-link wiki-link-missing",
                      title: href ? "Cmd/Ctrl+click to open" : "No doc with this title",
                      "data-href": href ?? "",
                    }),
                  )
                }
              })
              return DecorationSet.create(state.doc, decos)
            },
            handleClick(_view, _pos, event) {
              if (!(event.metaKey || event.ctrlKey)) return false
              const target = (event.target as HTMLElement).closest<HTMLElement>(".wiki-link")
              const href = target?.dataset.href
              if (!href) return false
              open(href)
              return true
            },
          },
        }),
      ]
    },
  })
}

/**
 * Tiptap-based inline WYSIWYG editor. Fixed toolbar, a bubble menu on
 * selection, a `/` block menu, and markdown shortcuts while typing
 * (`# `, `- `, `> `, `[ ] `, ``` … ).
 *
 * - `format="markdown"` (docs): reads/writes markdown, so stored docs stay
 *   compatible with `MarkdownLite` and `[[wiki link]]` backlinks.
 * - `format="html"` (ticket descriptions): reads/writes HTML and only offers
 *   blocks that `sanitizeRichText` keeps.
 */
export function TiptapEditor({
  value,
  onChange,
  format = "markdown",
  variant = "doc",
  placeholder = "Type / for blocks…",
  minHeight,
  autoFocus,
  resolveWikiLink = () => null,
  onOpenLink,
  onBlur,
  className,
}: {
  value: string
  onChange: (next: string) => void
  format?: "markdown" | "html"
  /**
   * `doc` fills its parent; `field` is a bordered, form-sized box; `inline`
   * is borderless with no fixed toolbar — just the bubble and `/` menus.
   */
  variant?: "doc" | "field" | "inline"
  placeholder?: string
  minHeight?: number
  autoFocus?: boolean
  resolveWikiLink?: (title: string) => string | null
  onOpenLink?: (href: string) => void
  onBlur?: () => void
  className?: string
}) {
  const html = format === "html"
  const [slash, setSlash] = useState<SlashState | null>(null)
  const slashRef = useRef(slash)
  slashRef.current = slash
  // Latest callbacks, read from inside ProseMirror plugins created once.
  const resolveRef = useRef(resolveWikiLink)
  resolveRef.current = resolveWikiLink
  const openRef = useRef(onOpenLink)
  openRef.current = onOpenLink
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onBlurRef = useRef(onBlur)
  onBlurRef.current = onBlur
  const lastEmitted = useRef(value)

  const editor = useEditor({
    immediatelyRender: false,
    content: html ? sanitizeRichText(value) : value,
    contentType: format,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: html ? [2] : [1, 2, 3] },
        horizontalRule: html ? false : undefined,
        underline: html ? false : undefined,
        link: { openOnClick: false, autolink: true },
      }),
      ...(html
        ? []
        : [TaskList, TaskItem.configure({ nested: true }), Markdown]),
      Placeholder.configure({ placeholder }),
      slashCommands(html, setSlash, (event) => {
        const s = slashRef.current
        if (!s?.items.length) return false
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1
          setSlash({ ...s, highlight: (s.highlight + step + s.items.length) % s.items.length })
          return true
        }
        if (event.key === "Enter" || event.key === "Tab") {
          pick(s, s.items[s.highlight])
          return true
        }
        return false
      }),
      ...(html
        ? []
        : [
            wikiLinks(
              (t) => resolveRef.current(t),
              (href) => openRef.current?.(href),
            ),
          ]),
    ],
    editorProps: {
      attributes: {
        class: cn(
          "tiptap-doc outline-none",
          variant === "doc" && "min-h-full px-1 pb-24",
          variant === "field" && "px-3 py-2.5 text-sm",
          variant === "inline" &&
            "-mx-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40 focus:bg-transparent",
        ),
        ...(minHeight ? { style: `min-height: ${minHeight}px` } : {}),
      },
    },
    onBlur: () => onBlurRef.current?.(),
    onUpdate: ({ editor }) => {
      const next = html
        ? editor.isEmpty
          ? ""
          : // drop StarterKit's trailing empty paragraph
            editor.getHTML().replace(/(<p><\/p>)+$/, "")
        : toMarkdown(editor)
      lastEmitted.current = next
      onChangeRef.current(next)
    },
  })

  // Only reset content when the value changes from outside the editor.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return
    lastEmitted.current = value
    editor.commands.setContent(html ? sanitizeRichText(value) : value, {
      contentType: format,
      emitUpdate: false,
    })
  }, [editor, value, html, format])

  function pick(s: SlashState, cmd: Command | undefined) {
    if (!cmd) return
    setSlash(null)
    s.command(cmd)
  }

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            code: e.isActive("code"),
            link: e.isActive("link"),
            h1: e.isActive("heading", { level: 1 }),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            ul: e.isActive("bulletList"),
            ol: e.isActive("orderedList"),
            task: e.isActive("taskList"),
            quote: e.isActive("blockquote"),
            codeBlock: e.isActive("codeBlock"),
          }
        : null,
  })

  const [linkUrl, setLinkUrl] = useState<string | null>(null)

  function setLink() {
    if (!editor) return
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "")
  }

  function applyLink() {
    if (!editor || linkUrl === null) return
    const url = linkUrl.trim()
    setLinkUrl(null)
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    const href = /^(https?:|mailto:|\/)/.test(url) ? url : `https://${url}`
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
  }

  type Tool = {
    key: keyof NonNullable<typeof active>
    label: string
    icon: typeof TextBIcon
    run: () => void
    /** Markdown-only: `sanitizeRichText` would strip it from HTML. */
    mdOnly?: boolean
  }
  const chain = () => editor!.chain().focus()
  const inlineTools: Tool[] = [
    { key: "bold", label: "Bold", icon: TextBIcon, run: () => chain().toggleBold().run() },
    { key: "italic", label: "Italic", icon: TextItalicIcon, run: () => chain().toggleItalic().run() },
    { key: "strike", label: "Strikethrough", icon: TextStrikethroughIcon, run: () => chain().toggleStrike().run() },
    { key: "code", label: "Inline code", icon: CodeIcon, run: () => chain().toggleCode().run() },
    { key: "link", label: "Link", icon: LinkIcon, run: setLink },
  ]
  const allBlockTools: Tool[] = [
    { key: "h1", label: "Heading 1", icon: TextHOneIcon, run: () => chain().toggleHeading({ level: 1 }).run(), mdOnly: true },
    { key: "h2", label: "Heading 2", icon: TextHTwoIcon, run: () => chain().toggleHeading({ level: 2 }).run() },
    { key: "h3", label: "Heading 3", icon: TextHThreeIcon, run: () => chain().toggleHeading({ level: 3 }).run(), mdOnly: true },
    { key: "ul", label: "Bulleted list", icon: ListIcon, run: () => chain().toggleBulletList().run() },
    { key: "ol", label: "Numbered list", icon: ListNumbersIcon, run: () => chain().toggleOrderedList().run() },
    { key: "task", label: "To-do list", icon: ListChecksIcon, run: () => chain().toggleTaskList().run(), mdOnly: true },
    { key: "quote", label: "Quote", icon: QuotesIcon, run: () => chain().toggleBlockquote().run() },
    { key: "codeBlock", label: "Code block", icon: CodeBlockIcon, run: () => chain().toggleCodeBlock().run() },
  ]
  const blockTools = allBlockTools.filter((t) => !(html && t.mdOnly))

  const toolButton = (t: Tool) => (
    <button
      key={t.key}
      type="button"
      title={t.label}
      aria-label={t.label}
      aria-pressed={active?.[t.key] ?? false}
      onMouseDown={(e) => e.preventDefault()}
      onClick={t.run}
      className={cn(
        "rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground",
        active?.[t.key] && "bg-muted text-foreground",
      )}
    >
      <t.icon className="size-4" />
    </button>
  )

  return (
    <div
      className={cn(
        "flex flex-col",
        variant === "doc" && "min-h-0 flex-1",
        variant === "field" &&
          "rounded-lg border border-input focus-within:border-ring",
        className,
      )}
    >
      {variant === "inline" ? null : (
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-0.5 border-b",
          variant === "doc" ? "pb-1.5" : "border-input p-1",
        )}
      >
        {blockTools.map(toolButton)}
        <span className="mx-1 h-4 w-px bg-border" />
        {inlineTools.map(toolButton)}
        {html ? null : (
        <button
          type="button"
          title="Divider"
          aria-label="Divider"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor && chain().setHorizontalRule().run()}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MinusIcon className="size-4" />
        </button>
        )}
      </div>
      )}

      {linkUrl !== null ? (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 p-2">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                applyLink()
              }
              if (e.key === "Escape") {
                setLinkUrl(null)
                editor?.commands.focus()
              }
            }}
            placeholder="https://… (empty to remove)"
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
        className={cn(
          "relative",
          variant === "doc" && "min-h-0 flex-1 overflow-y-auto pt-4",
          variant === "field" && "max-h-[60vh] overflow-y-auto",
        )}
      >
        {editor ? (
          <BubbleMenu
            editor={editor}
            shouldShow={({ editor: e, from, to }) =>
              from !== to && !e.isActive("codeBlock")
            }
            className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {inlineTools.map(toolButton)}
            <span className="mx-0.5 h-4 w-px bg-border" />
            {blockTools.filter((t) => t.key.startsWith("h")).map(toolButton)}
          </BubbleMenu>
        ) : null}

        <EditorContent editor={editor} className="h-full" />
      </div>

      {slash && slash.items.length > 0 && slash.rect ? (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="fixed z-50 flex max-h-72 w-64 flex-col overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          style={{
            left: slash.rect.left,
            top:
              slash.rect.bottom + 300 > window.innerHeight
                ? Math.max(slash.rect.top - 300, 8)
                : slash.rect.bottom + 6,
          }}
        >
          {slash.items.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(slash, c)}
              onPointerEnter={() => setSlash({ ...slash, highlight: i })}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
                i === slash.highlight && "bg-accent text-accent-foreground",
              )}
            >
              <c.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{c.label}</span>
                <span className="truncate text-xs text-muted-foreground">{c.desc}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
