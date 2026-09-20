import { HttpError } from "@/lib/api"

/**
 * ClickUp pull via the REST API. The user pastes a personal `pk_…` token in
 * the import dialog; it travels in the request body, is used for one pull,
 * and is never persisted.
 *
 * All endpoints live on api.clickup.com regardless of EU/US hosting.
 */

const CU = "https://api.clickup.com/api/v2"

export type ClickupTeam = { id: string; name: string }
export type ClickupList = { id: string; name: string; space: string }
export type ClickupTask = {
  title: string
  body: string
  resolved: boolean
  priority: "urgent" | "high" | "medium" | "low"
}

type JsonObject = Record<string, unknown>

async function cu<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${CU}${path}`, {
    headers: {
      authorization: token,
      "content-type": "application/json",
    },
  })
  const body = (await res.json().catch(() => null)) as
    | (JsonObject & { ECODE?: string; err?: string })
    | null
  if (!res.ok) {
    const message = body?.err ?? `ClickUp API failed (${res.status})`
    if (res.status === 401) {
      throw new HttpError(
        "That ClickUp token was rejected — check the pk_ token",
        502,
      )
    }
    throw new HttpError(
      `${message}${body?.ECODE ? ` (${body.ECODE})` : ""}`,
      502,
    )
  }
  return body as unknown as T
}

export async function clickupTeams(token: string): Promise<ClickupTeam[]> {
  const data = await cu<{ teams: { id: string; name: string }[] }>(
    token,
    "/team",
  )
  return (data.teams ?? []).map((t) => ({ id: t.id, name: t.name }))
}

/**
 * Every list reachable in a workspace: folderless lists per space plus lists
 * inside each folder.
 */
export async function clickupLists(
  token: string,
  teamId: string,
): Promise<ClickupList[]> {
  const spaces = await cu<{ spaces: { id: string; name: string }[] }>(
    token,
    `/team/${teamId}/space?archived=false`,
  )
  const rows: ClickupList[] = []

  await Promise.all(
    (spaces.spaces ?? []).map(async (space) => {
      const [root, folders] = await Promise.all([
        cu<{ lists: { id: string; name: string }[] }>(
          token,
          `/space/${space.id}/list?archived=false`,
        ).catch(() => ({ lists: [] })),
        cu<{ folders: { id: string; name: string }[] }>(
          token,
          `/space/${space.id}/folder?archived=false`,
        ).catch(() => ({ folders: [] })),
      ])
      for (const l of root.lists ?? []) {
        rows.push({ ...l, space: space.name })
      }
      for (const folder of folders.folders ?? []) {
        const lists = await cu<{ lists: { id: string; name: string }[] }>(
          token,
          `/folder/${folder.id}/list?archived=false`,
        ).catch(() => ({ lists: [] }))
        for (const l of lists.lists ?? []) {
          rows.push({ ...l, space: `${space.name} / ${folder.name}` })
        }
      }
    }),
  )
  return rows.sort((a, b) =>
    `${a.space}${a.name}`.localeCompare(`${b.space}${b.name}`),
  )
}

const STATUS_EDGE: Record<
  string,
  "urgent" | "high" | "medium" | "low" | undefined
> = {
  urgent: "urgent",
  high: "high",
  normal: "medium",
  low: "low",
}

function mapTask(task: {
  name: string
  description?: string | null
  status?: { status?: string; type?: string } | null
  priority?: { priority?: string } | null
}): ClickupTask {
  const statusName = task.status?.status ?? ""
  const statusType = task.status?.type ?? "custom"
  const resolved =
    statusType === "closed" ||
    statusType === "done" ||
    ["closed", "complete"].includes(statusName.toLowerCase())
  return {
    title: task.name,
    body: task.description ?? "",
    resolved,
    priority:
      STATUS_EDGE[task.priority?.priority ?? "normal"] ?? ("medium" as const),
  }
}

/** Tasks of one list, closed included, pages walked until `last_page`. */
export async function clickupTasks(
  token: string,
  listId: string,
): Promise<ClickupTask[]> {
  const rows: ClickupTask[] = []
  for (let page = 0; page < 10; page++) {
    const data = await cu<{
      tasks?: {
        name: string
        description?: string | null
        status?: { status?: string; type?: string } | null
        priority?: { priority?: string } | null
      }[]
      last_page?: boolean
    }>(
      token,
      `/list/${listId}/task?page=${page}&page_size=100&include_closed=true`,
    )
    for (const t of data.tasks ?? []) rows.push(mapTask(t))
    if (!(data.tasks?.length && !data.last_page)) break
  }
  return rows
}
