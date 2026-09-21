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
}

export type GithubColumn = { label: string; terminal: boolean }

/** Status option names commonly used as a board's terminal column. */
const TERMINAL_STATUS_NAMES = /^(done|closed|complete|completed|merged|resolved)$/i

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
  if (!res.ok || body?.errors?.length) {
    const message =
      body?.errors?.[0]?.message ?? `GraphQL failed (${res.status})`
    const hint = /scope|permission/i.test(message)
      ? " — does your GitHub connection include read:project? Reconnect in Settings."
      : ""
    throw new HttpError(`${message}${hint}`, 502)
  }
  if (!body?.data) throw new HttpError("GitHub returned no data", 502)
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

/** Items of one board (first 100, draft issues included), plus the board's
 * own "Status" column set so the import can mirror it instead of collapsing
 * everything into Tesuto's generic defaults. */
export async function listGithubItems(
  token: string,
  projectId: string,
): Promise<{ title: string; columns: GithubColumn[]; items: GithubItem[] }> {
  const data = await gql<{
    node: {
      title: string
      fields: { nodes: { name?: string; options?: { name: string }[] }[] }
      items: {
        nodes: {
          fieldValueByName: { name?: string } | null
          content: {
            title?: string
            body?: string
            state?: string
          } | null
        }[]
      }
    } | null
  }>(
    token,
    `query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          title
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField { name options { name } }
            }
          }
          items(first: 100, orderBy: { field: POSITION, direction: ASC }) {
            nodes {
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
              content {
                ... on Issue { title body state }
                ... on PullRequest { title body state }
                ... on DraftIssue { title body }
              }
            }
          }
        }
      }
    }`,
    { id: projectId },
  )
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
  for (const row of data.node.items.nodes) {
    if (!row.content?.title) continue
    items.push({
      title: row.content.title,
      body: row.content.body ?? "",
      resolved:
        row.content.state === "CLOSED" || row.content.state === "MERGED",
      status: row.fieldValueByName?.name,
    })
  }
  return { title: data.node.title, columns, items }
}
