/**
 * End-to-end smoke test for the Tesuto backend. Drives the same HTTP calls the
 * client store (`lib/store.tsx`) makes, in the same order.
 *
 *   bun run smoke            # against http://localhost:3005
 *   BASE=http://host/api bun run scripts/smoke.mjs
 *
 * Non-destructive: everything it creates it deletes. Run against a dev DB.
 */
const BASE = process.env.BASE ?? "http://localhost:3005/api"
let token = null
let failures = 0

async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, ...json }
}
const post = (p, body) =>
  call(p, { method: "POST", body: JSON.stringify(body) })
const patch = (p, body) =>
  call(p, { method: "PATCH", body: JSON.stringify(body) })
const del = (p) => call(p, { method: "DELETE" })

function assert(label, cond) {
  if (!cond) failures++
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`)
}

let r = await post("/auth/sign-in", {
  name: "Ava Reyes",
  email: "ava@company.com",
})
assert("sign-in → token + user", Boolean(r.data?.token) && r.data?.user?.id)
token = r.data?.token

r = await call("/bootstrap")
const b = r.data
assert(
  "bootstrap → all collections",
  b?.users?.length &&
    b.projects.length &&
    b.columns.length &&
    b.tickets.length &&
    b.docs.length &&
    b.me?.id,
)
assert(
  "bootstrap → ticket carries events + screenshotUrl key",
  Array.isArray(b.tickets[0].events) && "screenshotUrl" in b.tickets[0],
)

const project = b.projects[0]

r = await post("/tickets", {
  title: "smoke ticket",
  projectId: project.id,
  priority: "high",
  type: "bug",
  assigneeId: b.users.find((u) => u.id !== b.me.id)?.id,
})
const t = r.data
assert(
  "addTicket → key + created/assigned events",
  /-\d+$/.test(t?.key) && t.events.length === 2 && t.assignedAt,
)

r = await patch(`/tickets/${t.id}`, { status: "done" })
assert(
  "updateTicket status → resolvedAt + status event",
  r.data?.resolvedAt && r.data.events.at(-1).to === "done",
)

r = await patch(`/tickets/${t.id}`, { status: "todo", order: Date.now() })
assert(
  "moveTicket → float order accepted",
  r.status === 200 && r.data.status === "todo",
)

r = await post(`/tickets/${t.id}/comments`, { body: "smoke comment" })
assert("addComment → comment row", r.data?.body === "smoke comment")

r = await post(`/tickets/${t.id}/sync-github`, {})
assert(
  "syncToGithub → url + synced event",
  /github\.com/.test(r.data?.githubIssueUrl),
)

r = await post("/projects", { name: "Smoke Proj", description: "x" })
const np = r.data
assert("addProject → key + token", np?.key && np.token?.startsWith("tsto_pk_"))

r = await post("/columns", { label: "Smoke Col" })
const nc = r.data
r = await call("/columns")
assert(
  "addColumn → inserted before terminal",
  r.data.map((c) => c.id).indexOf(nc.id) <
    r.data.map((c) => c.id).indexOf("done"),
)
r = await del(`/columns/${nc.id}?reassignTo=${b.columns[0].id}`)
assert("removeColumn → deleted", r.data?.deleted === nc.id)

r = await patch("/me", { bio: "smoke" })
assert("updateProfile → saved", r.data?.bio === "smoke")
await patch("/me", { bio: null })

r = await post("/me/github", {})
assert("connectGithub", r.data?.githubConnected === true)
r = await del("/me/github")
assert("disconnectGithub", r.data?.githubConnected === false)

r = await post("/tickets/bulk", { action: "delete", ids: [t.id] })
assert("deleteTickets (bulk) → cleanup", r.data?.deleted === 1)

// widget API — user bearer token + X-Tesuto-Project header
const wh = {
  "content-type": "application/json",
  authorization: `Bearer ${token}`,
  "x-tesuto-project": project.token,
}
r = await fetch(`${BASE}/widget/issues`, { method: "OPTIONS" })
assert(
  "widget OPTIONS → 204 + CORS",
  r.status === 204 && r.headers.get("access-control-allow-origin") === "*",
)
r = await fetch(
  `${BASE}/widget/project?token=${encodeURIComponent(project.token)}`,
).then((x) => x.json())
assert("widget project (public) → name", r.data?.name === project.name)
r = await fetch(`${BASE}/widget/project?token=nope`).then((x) => x.json())
assert(
  "widget project → bad token 401",
  r.error && /token/i.test(r.error.message),
)
r = await fetch(`${BASE}/widget/auth`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-tesuto-project": project.token,
  },
  body: JSON.stringify({ name: "Widget Guy", email: "wguy@x.com" }),
}).then((x) => x.json())
assert(
  "widget auth (host user) → user + token",
  r.data?.token && r.data?.user?.id,
)
r = await fetch(`${BASE}/widget/auth`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-tesuto-project": project.token,
  },
  body: JSON.stringify({}),
}).then((x) => x.json())
assert(
  "widget auth (anonymous) → 'Widget' user",
  r.data?.token && r.data?.user?.id === "widget",
)
r = await fetch(`${BASE}/widget/bootstrap`, { headers: wh }).then((x) =>
  x.json(),
)
assert(
  "widget bootstrap → project + user + columns",
  r.data?.project?.id && r.data?.user?.id && r.data?.columns?.length,
)
r = await fetch(`${BASE}/widget/issues`, {
  method: "POST",
  headers: wh,
  body: JSON.stringify({
    title: "smoke widget issue",
    priority: "medium",
    sourceUrl: "http://host/x",
    domSnapshot: { selector: "", tag: "", x: 0.5, y: 0.5 },
  }),
}).then((x) => x.json())
assert("widget POST → ticket on the board", /-\d+$/.test(r.data?.key))
const wIssueId = r.data?.id
r = await fetch(`${BASE}/widget/issues/${wIssueId}`, {
  method: "PATCH",
  headers: wh,
  body: JSON.stringify({ priority: "high", status: "in_progress" }),
}).then((x) => x.json())
assert(
  "widget PATCH → priority + status",
  r.data?.priority === "high" && r.data?.status === "in_progress",
)
r = await fetch(`${BASE}/widget/issues/${wIssueId}/comments`, {
  method: "POST",
  headers: wh,
  body: JSON.stringify({ body: "widget reply" }),
}).then((x) => x.json())
assert("widget comment → author is the user", r.data?.author?.id)
r = await fetch(`${BASE}/widget/issues?scope=page&url=http://host/x`, {
  headers: wh,
}).then((x) => x.json())
assert(
  "widget list scope=page",
  r.data?.length === 1 && r.data[0].comments === 1,
)

if (wIssueId) await del(`/tickets/${wIssueId}`)
await del(`/projects/${np.id}`)

token = null
r = await call("/bootstrap")
assert("no token → 401", r.status === 401)

console.log(failures ? `\n${failures} failing` : "\nall green")
process.exit(failures ? 1 : 0)
