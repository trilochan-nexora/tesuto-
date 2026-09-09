"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export function CopyableCode({
  code,
  label,
  className,
}: {
  code: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => {},
    )
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      ) : null}
      <div className="group relative">
        <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 pr-11 font-mono text-xs leading-relaxed ring-1 ring-foreground/10">
          <code>{code}</code>
        </pre>
        <button
          onClick={copy}
          aria-label="Copy to clipboard"
          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          {copied ? (
            <Check className="size-4 text-emerald-500" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
    </div>
  )
}

export function embedSnippet(
  token: string,
  origin = "https://tesuto.company.com",
) {
  return `<script
  src="${origin}/widget.js"
  data-project-token="${token}"
  defer
></script>`
}
