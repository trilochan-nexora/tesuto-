import { Check } from "lucide-react"
import Link from "next/link"
import { Fragment } from "react"
import { cn } from "@/lib/utils"

type WikiResolver = (title: string) => string | null

/**
 * A deliberately small Markdown renderer — headings, paragraphs, lists with
 * Notion-style task checkboxes, dividers, fenced/inline code, **bold**,
 * ~~strikethrough~~, and `[[wiki links]]`. Not a general-purpose parser;
 * docs are authored by the team, not untrusted input.
 */
export function MarkdownLite({
  content,
  resolveWikiLink,
}: {
  content: string
  resolveWikiLink?: WikiResolver
}) {
  const blocks = content.split(/\n{2,}/)

  return (
    <div className="flex flex-col gap-4 text-[0.95rem] leading-relaxed text-foreground/90">
      {blocks.map((block, i) => {
        const key = `${i}-${block.slice(0, 12)}`

        if (block.trim() === "---") {
          return <hr key={key} className="border-border" />
        }
        if (block.startsWith("```")) {
          const code = block.replace(/^```[a-z]*\n?/, "").replace(/```$/, "")
          return (
            <pre
              key={key}
              className="overflow-x-auto rounded-lg bg-muted/60 p-4 font-mono text-xs leading-relaxed ring-1 ring-foreground/10"
            >
              <code>{code}</code>
            </pre>
          )
        }
        if (block.startsWith("### ")) {
          return (
            <h3 key={key} className="mt-1 font-semibold">
              {inline(block.slice(4), resolveWikiLink)}
            </h3>
          )
        }
        if (block.startsWith("## ")) {
          return (
            <h2
              key={key}
              className="mt-2 text-base font-semibold tracking-tight"
            >
              {inline(block.slice(3), resolveWikiLink)}
            </h2>
          )
        }
        if (block.startsWith("# ")) {
          return (
            <h1 key={key} className="text-xl font-semibold tracking-tight">
              {inline(block.slice(2), resolveWikiLink)}
            </h1>
          )
        }
        if (block.startsWith("> ")) {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-border pl-3 text-muted-foreground"
            >
              {inline(block.replace(/^> ?/gm, ""), resolveWikiLink)}
            </blockquote>
          )
        }

        if (/^[-*] |^- \[[ x]\] |^\d+[.)] /m.test(block)) {
          const ordered = /^\d+[.)] /.test(block)
          const items = block
            .split("\n")
            .filter((l) => /^([-*] |[-*] \[[ x]\] |\d+[.)] )/.test(l))
          const Tag = ordered ? "ol" : "ul"
          return (
            <Tag
              key={key}
              className={cn(
                "flex flex-col gap-1.5 pl-1",
                ordered ? "list-decimal pl-5" : "list-none",
              )}
            >
              {items.map((item, j) => {
                const task = item.match(/^[-*] \[([ x])\] (.*)$/)
                const plain = item.replace(
                  /^([-*] |[-*] \[[ x]\] |\d+[.)] )/,
                  "",
                )
                if (task) {
                  const checked = task[1] === "x"
                  return (
                    <li key={j} className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background",
                        )}
                      >
                        {checked ? <Check className="size-3" /> : null}
                      </span>
                      <span
                        className={cn(
                          "min-w-0",
                          checked &&
                            "text-muted-foreground line-through decoration-muted-foreground/60",
                        )}
                      >
                        {inline(task[2], resolveWikiLink)}
                      </span>
                    </li>
                  )
                }
                return <li key={j}>{inline(plain, resolveWikiLink)}</li>
              })}
            </Tag>
          )
        }

        return <p key={key}>{inline(block, resolveWikiLink)}</p>
      })}
    </div>
  )
}

function inline(text: string, resolveWikiLink?: WikiResolver) {
  return text
    .split(/(\[\[[^\]]+\]\]|`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~)/g)
    .map((part, i) => {
      if (part.startsWith("[[") && part.endsWith("]]")) {
        const title = part.slice(2, -2).trim()
        const href = resolveWikiLink?.(title) ?? null
        if (href) {
          return (
            <Link
              key={i}
              href={href}
              className="rounded bg-primary/10 px-1 py-0.5 text-primary hover:bg-primary/15"
            >
              {title}
            </Link>
          )
        }
        return (
          <span
            key={i}
            className="rounded bg-muted px-1 py-0.5 text-muted-foreground"
            title="No document with this title yet"
          >
            {title}
          </span>
        )
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={i}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          >
            {part.slice(1, -1)}
          </code>
        )
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        )
      }
      if (part.startsWith("~~") && part.endsWith("~~")) {
        return <s key={i}>{part.slice(2, -2)}</s>
      }
      return <Fragment key={i}>{part}</Fragment>
    })
}
