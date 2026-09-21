/**
 * Parses the fixed Markdown shape emitted by Hearth's
 * `apps/server/scripts/release-notes.ts` (render()) so /releases can show a
 * short, plain-language summary up front and push the full endpoint-by-
 * endpoint breakdown into a collapsed "Technical details" section.
 */

export type ReleaseCounts = {
  added: number
  modified: number
  breaking: number
  deprecated: number
  fixed: number
}

export type ParsedRelease = {
  compare: string | null
  counts: ReleaseCounts | null
  summary: string[]
  pmNote: string | null
  /** Everything after the Summary bullets, minus the boilerplate footer. */
  details: string
}

const COUNTS_RE =
  /🟢\s*(\d+)\s*added\s*·\s*🟡\s*(\d+)\s*modified\s*·\s*🔴\s*(\d+)\s*breaking\s*·\s*🟠\s*(\d+)\s*deprecated\s*·\s*🐛\s*(\d+)\s*fixed/

export function parseReleaseNotes(md: string): ParsedRelease {
  const compare = md.match(/\*\*Compare:\*\*\s*(.+)/)?.[1]?.trim() ?? null

  const c = md.match(COUNTS_RE)
  const counts = c
    ? {
        added: Number(c[1]),
        modified: Number(c[2]),
        breaking: Number(c[3]),
        deprecated: Number(c[4]),
        fixed: Number(c[5]),
      }
    : null

  const summaryStart = md.indexOf("## Summary")
  let summary: string[] = []
  let detailsStart = -1
  if (summaryStart >= 0) {
    detailsStart = md.indexOf("\n## ", summaryStart + 1)
    const block = md.slice(
      summaryStart + "## Summary".length,
      detailsStart >= 0 ? detailsStart : undefined,
    )
    summary = block
      .split("\n")
      .map((l) => l.replace(/^-\s+/, "").trim())
      .filter(Boolean)
  }

  const pmNote = md.match(/\*\*PM\*\*\s*—\s*(.+)/)?.[1]?.trim() ?? null

  const footerStart = md.indexOf("\n---\n")
  const details =
    detailsStart >= 0
      ? md.slice(detailsStart, footerStart >= 0 ? footerStart : undefined).trim()
      : md.trim()

  return { compare, counts, summary, pmNote, details }
}
