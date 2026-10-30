"use client"

import { TiptapEditor } from "@/components/tiptap-editor"

/**
 * WYSIWYG editor for rich descriptions — the Tiptap editor in HTML mode, so
 * it only offers what `sanitizeRichText` keeps (bold/italic/strike, H2,
 * lists, quotes, code, links). Emits HTML.
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
  return (
    <TiptapEditor
      format="html"
      variant="field"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      minHeight={minHeight}
      autoFocus={autoFocus}
      className={className}
    />
  )
}

export function isEmptyHtml(html?: string) {
  if (!html) return true
  return html.replace(/<[^>]*>/g, "").replace(/\s|&nbsp;/g, "").length === 0
}
