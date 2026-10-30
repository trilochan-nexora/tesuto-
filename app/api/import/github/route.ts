import { z } from "zod"
import { HttpError, handler } from "@/lib/api"
import {
  downloadGithubMedia,
  type GithubItem,
  type GithubMedia,
  listGithubItems,
} from "@/lib/providers/github-projects"
import { type ImportedMedia, importProject } from "@/lib/services/projects"
import { requireIntegration } from "@/lib/services/settings"
import { connectedGithubToken } from "@/lib/services/users"

const ImportSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
})

/** Limits concurrent downloads; signed media links expire within minutes. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

const SIZE: Record<ImportedMedia["kind"], number> = {
  screenshot: 6_000_000,
  recording: 11_000_000,
  attachment: 5_000_000,
}

/** First still image → screenshot, first video → recording, the rest →
 * attachments — the same slots a widget report fills. */
function assignKinds(files: GithubMedia[]): ImportedMedia[] {
  const out: ImportedMedia[] = []
  let screenshot = false
  let recording = false
  for (const f of files) {
    const size = (f.data.length * 3) / 4
    const still = /^image\/(png|jpeg|webp)$/.test(f.mimeType)
    const video = f.mimeType.startsWith("video/")
    let kind: ImportedMedia["kind"] = "attachment"
    if (still && !screenshot && size <= SIZE.screenshot) {
      kind = "screenshot"
      screenshot = true
    } else if (video && !recording) {
      kind = "recording"
      recording = true
    }
    if (size > SIZE[kind]) continue
    out.push({ kind, data: f.data, name: f.name })
  }
  return out
}

const ATTACHMENT_URL =
  /^https:\/\/(github\.com\/user-attachments\/|(private-)?user-images\.githubusercontent\.com\/)/

/**
 * Inline `<img>`/`<video>` tags and `![](…)` images become bare URL lines
 * (any HTML tag would otherwise make the sanitizer treat the whole Markdown
 * body as HTML). When every attachment was downloaded into Tesuto, those
 * lines are dropped — the media shows in the ticket's own sections.
 */
function cleanBody(body: string, mediaAttached: boolean) {
  const lines = body
    .replace(
      /<video\b[^>]*\ssrc="([^"]+)"[^>]*>(?:[\s\S]*?<\/video>)?/gi,
      "\n$1\n",
    )
    .replace(/<img\b[^>]*\ssrc="([^"]+)"[^>]*\/?>/gi, "\n$1\n")
    .replace(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g, "\n$1\n")
    .split("\n")
  return (
    mediaAttached ? lines.filter((l) => !ATTACHMENT_URL.test(l.trim())) : lines
  )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** The repo most of the board's issues live in — the project's sync target. */
function mostCommonRepo(items: GithubItem[]) {
  const counts = new Map<string, number>()
  for (const i of items) {
    if (i.repo) counts.set(i.repo, (counts.get(i.repo) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

async function withMedia(item: GithubItem) {
  const files = (await mapLimit(item.mediaUrls, 2, downloadGithubMedia)).filter(
    (f): f is GithubMedia => f !== null,
  )
  const media = assignKinds(files)
  const allAttached = media.length > 0 && media.length === item.mediaUrls.length
  return { item, media, body: cleanBody(item.body, allAttached) }
}

/**
 * Pulls one GitHub Projects (v2) board and creates a Tesuto project from it.
 * Mirrors each item's column, priority, type, assignees and link; images and
 * videos are copied into Tesuto's media storage. Closed/merged items without
 * a matching column start resolved.
 */
export const POST = handler({
  schema: ImportSchema,
  run: async (input, { user }) => {
    await requireIntegration(
      "integration.github_projects_import",
      "GitHub Projects import",
    )
    const token = await connectedGithubToken(user.id)
    const { title, columns, items } = await listGithubItems(
      token,
      input.projectId,
    )
    if (!items.length) {
      throw new HttpError("That board has no items to import", 422)
    }
    const name = input.name ?? title
    if (!name) throw new HttpError("Couldn't read the board title", 424)
    const prepared = await mapLimit(items, 4, withMedia)
    const issues = prepared.map(({ item: i, media, body }) => ({
      title: i.title,
      body,
      type: (i.type ?? "task") as "bug" | "feature" | "task" | "question",
      priority: (i.priority ?? "medium") as
        | "urgent"
        | "high"
        | "medium"
        | "low",
      resolved: i.resolved,
      status: i.status,
      assignees: i.assignees,
      url: i.url,
      media,
    }))
    return importProject(
      {
        name,
        description:
          input.description ?? `Imported from GitHub Projects “${title}”`,
        source: "github-projects",
        issues,
        columns,
        githubRepo: mostCommonRepo(items),
      },
      user.id,
    )
  },
})
