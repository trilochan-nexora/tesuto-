import { HttpError } from "@/lib/api"

/**
 * GitHub Projects (v2) pull via the GraphQL API, using the signed-in user's
 * connected OAuth token. Read-only: Tesuto imports boards as new projects.
 *
 * Note: the `read:project` scope must be granted — users who connected before
 * it was added need to disconnect and reconnect in Settings.
 */

const GQL = "https://api.github.com/graphql"

export type GithubProject = {
  id: string
  number: number
  title: string
  owner: string
  items: number
}

export type GithubItem = {
  title: string
  body: string
  resolved: boolean
  /** This item's value in the board's "Status" single-select field, if any. */
  status?: string
  /** "urgent" | "high" | "medium" | "low", from a Priority field or label. */
  priority?: string
  /** GitHub logins of the item's assignees. */
  assignees: string[]
  /** e.g. "hearth #740" — repo and issue number on GitHub. */
  ref?: string
  /** The issue/PR page on GitHub. */
  url?: string
  /** "owner/repo" the issue lives in. */
  repo?: string
  /** "bug" | "feature" | "task" | "question", from the issue type or labels. */
  type?: string
  /** Image/video URLs from the rendered body. For private repos these are
   * short-lived signed links (minutes), so download them right away. */
  mediaUrls: string[]
}

export type GithubColumn = { label: string; terminal: boolean }

/** Status option names commonly used as a board's terminal column. */
const TERMINAL_STATUS_NAMES =
  /^(done|closed|complete|completed|merged|resolved)$/i

/** First candidate that names one of Tesuto's priorities (P0/P1 also work). */
function toPriority(...names: (string | undefined)[]): string | undefined {
  for (const n of names) {
    const v = n
      ?.trim()
      .toLowerCase()
      .replace(/^priority[:\s-]*/, "")
    if (!v) continue
    if (/^(urgent|critical|p0)$/.test(v)) return "urgent"
    if (/^(high|p1)$/.test(v)) return "high"
    if (/^(medium|normal|p2)$/.test(v)) return "medium"
    if (/^(low|p3)$/.test(v)) return "low"
  }
}

/** Issue type (Bug/Feature/Task) first, then conventional labels. */
function toType(...names: (string | undefined)[]): string | undefined {
  for (const n of names) {
    const v = n?.trim().toLowerCase()
    if (!v) continue
    if (/^(bug|defect|regression)$/.test(v)) return "bug"
    if (/^(feature|enhancement|feature request)$/.test(v)) return "feature"
    if (/^(question|support)$/.test(v)) return "question"
    if (/^(task|chore|documentation)$/.test(v)) return "task"
  }
}

/** Hosts GitHub serves issue attachments from. Bodies are user-written, so
 * never fetch anything else (no camo-proxied third-party images, no SSRF). */
const MEDIA_HOSTS = new Set([
  "private-user-images.githubusercontent.com",
  "user-images.githubusercontent.com",
  "github.com",
])

function mediaUrlsFrom(html: string | undefined): string[] {
  if (!html) return []
  const urls = new Set<string>()
  for (const m of html.matchAll(/<(?:img|video)\b[^>]*?\ssrc="([^"]+)"/gi)) {
    const raw = m[1].replaceAll("&amp;", "&")
    try {
      const url = new URL(raw)
      if (url.protocol !== "https:" || !MEDIA_HOSTS.has(url.hostname)) continue
      if (
        url.hostname === "github.com" &&
        !url.pathname.startsWith("/user-attachments/")
      )
        continue
      urls.add(url.toString())
    } catch {}
  }
  return [...urls]
}

type GqlResult<T> = {
  data?: T
  errors?: { message: string }[]
}

async function gql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(GQL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "tesuto",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await res.json().catch(() => null)) as GqlResult<T> | null
  // Not 401: the client treats that as an expired Tesuto session.
  if (res.status === 401) {
    throw new HttpError(
      "Your GitHub connection has expired — reconnect GitHub in Settings.",
      400,
    )
  }
  // 424, not 502: Cloudflare swaps an origin 502 for its own HTML error page,
  // hiding this message from the user.
  if (!res.ok || body?.errors?.length) {
    const message =
      body?.errors?.[0]?.message ?? `GraphQL failed (${res.status})`
    const hint = /scope|permission/i.test(message)
      ? " — does your GitHub connection include read:project? Reconnect in Settings."
      : ""
    throw new HttpError(`${message}${hint}`, 424)
  }
  if (!body?.data) throw new HttpError("GitHub returned no data", 424)
  return body.data
}

/** All Projects V2 boards the user can see (their own + their orgs'). */
export async function listGithubProjects(
  token: string,
): Promise<GithubProject[]> {
  const data = await gql<{
    viewer: {
      projectsV2: { nodes: ProjectNode[] }
      organizations: {
        nodes: { login: string; projectsV2: { nodes: ProjectNode[] } }[]
      }
    }
  }>(
    token,
    `query {
      viewer {
        projectsV2(first: 100) { nodes {
          id number title
          items { totalCount }
        } }
        organizations(first: 100) { nodes {
          login
          projectsV2(first: 100) { nodes {
            id number title
            items { totalCount }
          } }
        } }
      }
    }`,
  )

  const seen = new Set<string>()
  const rows: GithubProject[] = []
  const push = (node: ProjectNode, owner: string) => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    rows.push({
      id: node.id,
      number: node.number,
      title: node.title || `Project #${node.number}`,
      owner,
      items: node.items?.totalCount ?? 0,
    })
  }
  for (const p of data.viewer.projectsV2.nodes) push(p, "you")
  for (const org of data.viewer.organizations.nodes) {
    for (const p of org.projectsV2.nodes) push(p, org.login)
  }
  return rows.sort(
    (a, b) => a.owner.localeCompare(b.owner) || a.number - b.number,
  )
}

type ProjectNode = {
  id: string
  number: number
  title: string
  items?: { totalCount: number }
}

/** Items of one board (all pages, draft issues included), plus the board's
 * own "Status" column set so the import can mirror it instead of collapsing
 * everything into Tesuto's generic defaults. */
export async function listGithubItems(
  token: string,
  projectId: string,
): Promise<{ title: string; columns: GithubColumn[]; items: GithubItem[] }> {
  type Page = {
    node: {
      title: string
      fields: { nodes: { name?: string; options?: { name: string }[] }[] }
      items: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: {
          fieldValueByName: { name?: string } | null
          priorityValue: { name?: string } | null
          content: {
            title?: string
            body?: string
            bodyHTML?: string
            url?: string
            issueType?: { name: string } | null
            state?: string
            number?: number
            repository?: { name: string; nameWithOwner: string }
            labels?: { nodes: { name: string }[] }
            assignees?: { nodes: { login: string }[] }
          } | null
        }[]
      }
    } | null
  }
  const query = `query($id: ID!, $after: String) {
      node(id: $id) {
        ... on ProjectV2 {
          title
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField { name options { name } }
            }
          }
          items(first: 100, after: $after, orderBy: { field: POSITION, direction: ASC }) {
            pageInfo { hasNextPage endCursor }
            nodes {
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
              priorityValue: fieldValueByName(name: "Priority") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
              content {
                ... on Issue {
                  title body bodyHTML url state number repository { name nameWithOwner }
                  issueType { name }
                  labels(first: 20) { nodes { name } }
                  assignees(first: 10) { nodes { login } }
                }
                ... on PullRequest {
                  title body bodyHTML url state number repository { name nameWithOwner }
                  labels(first: 20) { nodes { name } }
                  assignees(first: 10) { nodes { login } }
                }
                ... on DraftIssue {
                  title body
                  assignees(first: 10) { nodes { login } }
                }
              }
            }
          }
        }
      }
    }`
  let data = await gql<Page>(token, query, { id: projectId })
  const rows = data.node?.items.nodes ?? []
  // GitHub caps a page at 100 items — keep following the cursor so large
  // boards aren't silently truncated.
  while (data.node?.items.pageInfo.hasNextPage && rows.length < 5_000) {
    data = await gql<Page>(token, query, {
      id: projectId,
      after: data.node.items.pageInfo.endCursor,
    })
    rows.push(...(data.node?.items.nodes ?? []))
  }
  if (!data.node) throw new HttpError("GitHub project not found", 404)

  const statusField = data.node.fields.nodes.find(
    (f) => f.name?.toLowerCase() === "status" && f.options?.length,
  )
  const columns: GithubColumn[] = (statusField?.options ?? []).map((o) => ({
    label: o.name,
    terminal: TERMINAL_STATUS_NAMES.test(o.name.trim()),
  }))
  // If nothing was named for a terminal column, treat the last one (GitHub's
  // own convention — "Done" sits at the end of the default template) as it.
  if (columns.length && !columns.some((c) => c.terminal)) {
    columns[columns.length - 1].terminal = true
  }

  const items: GithubItem[] = []
  for (const row of rows) {
    if (!row.content?.title) continue
    items.push({
      title: row.content.title,
      body: row.content.body ?? "",
      resolved:
        row.content.state === "CLOSED" || row.content.state === "MERGED",
      status: row.fieldValueByName?.name,
      priority: toPriority(
        row.priorityValue?.name,
        ...(row.content.labels?.nodes.map((l) => l.name) ?? []),
      ),
      assignees: row.content.assignees?.nodes.map((a) => a.login) ?? [],
      ref:
        row.content.repository && row.content.number
          ? `${row.content.repository.name} #${row.content.number}`
          : undefined,
      url: row.content.url,
      repo: row.content.repository?.nameWithOwner,
      type: toType(
        row.content.issueType?.name,
        ...(row.content.labels?.nodes.map((l) => l.name) ?? []),
      ),
      mediaUrls: mediaUrlsFrom(row.content.bodyHTML),
    })
  }
  return { title: data.node.title, columns, items }
}

export type GithubMedia = { mimeType: string; data: string; name: string }

const MEDIA_TYPES = /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm))$/
/** Matches the largest Tesuto media kind (recordings); bigger files stay links. */
const MEDIA_MAX_BYTES = 11_000_000

/** Downloads one attachment as a base64 data URL; null if unsupported, too
 * large, or the signed link has expired. Never throws. */
export async function downloadGithubMedia(
  url: string,
): Promise<GithubMedia | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "tesuto" },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const mimeType = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase()
    if (!MEDIA_TYPES.test(mimeType)) return null
    if (Number(res.headers.get("content-length") ?? 0) > MEDIA_MAX_BYTES) {
      return null
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    if (!bytes.length || bytes.length > MEDIA_MAX_BYTES) return null
    const file = decodeURIComponent(
      new URL(url).pathname.split("/").pop() ?? "",
    )
    return {
      mimeType,
      data: `data:${mimeType};base64,${bytes.toString("base64")}`,
      name: /\.[a-z0-9]{2,4}$/i.test(file)
        ? file
        : `${mimeType.split("/")[0]}.${mimeType.split("/")[1]}`,
    }
  } catch {
    return null
  }
}
