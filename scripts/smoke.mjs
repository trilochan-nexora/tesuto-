/**
 * End-to-end smoke test for the Tesuto backend. Drives the same HTTP calls the
 * client store (`lib/store.tsx`) makes, in the same order.
 *
 *   bun run smoke            # against http://localhost:3005
 *   BASE=http://host/api bun run scripts/smoke.mjs
 *
 * Non-destructive: everything it creates it deletes. Run against a dev DB.
 */
import { createHmac } from "node:crypto"

const BASE = process.env.BASE ?? "http://localhost:3005/api"
const SMOKE_EMAIL = process.env.SMOKE_EMAIL ?? "ava@company.com"
const DEV_CODE = process.env.AUTH_DEV_CODE ?? ""
let cookie = null
let failures = 0

async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...init.headers,
    },
  })
  const json = await res.json().catch(() => ({}))
  return {
    status: res.status,
    setCookie: res.headers.get("set-cookie"),
    ...json,
  }
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

if (!/^\d{6}$/.test(DEV_CODE)) {
  throw new Error(
    "Set AUTH_DEV_CODE to the same six-digit value used by the dev server",
  )
}

let r = await post("/auth/sign-in", { email: SMOKE_EMAIL })
assert("sign-in request → generic success", r.status === 200 && r.data?.ok)
r = await post("/auth/verify", { email: SMOKE_EMAIL, code: DEV_CODE })
assert(
  "sign-in verify → HttpOnly cookie + user",
  Boolean(r.setCookie) && r.data?.user?.id,
)
cookie = r.setCookie?.split(";")[0] ?? null

r = await fetch(`${new URL(BASE).origin}/api/health/live`).then(
  async (res) => ({
    httpStatus: res.status,
    ...(await res.json()),
  }),
)
assert(
  "liveness → no dependency gate",
  r.httpStatus === 200 && r.status === "ok",
)
r = await fetch(`${new URL(BASE).origin}/api/health/ready`).then(
  async (res) => ({
    httpStatus: res.status,
    ...(await res.json()),
  }),
)
assert(
  "readiness → database + media",
  r.httpStatus === 200 && r.checks?.media === "ok",
)

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
assert(
  "bootstrap → integrations with enable/available",
  b.integrations?.slack?.enabled !== undefined &&
    b.integrations?.email?.enabled !== undefined &&
    b.integrations?.githubSync?.enabled !== undefined,
)

const project = b.projects[0]

r = await fetch(`${BASE}/projects`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie,
    origin: "https://attacker.invalid",
  },
  body: JSON.stringify({ name: "csrf should fail", description: "" }),
}).then(async (res) => ({ status: res.status, ...(await res.json()) }))
assert("cookie mutation → rejects foreign Origin", r.status === 403)

r = await post("/tickets", {
  title: "smoke ticket",
  description:
    '<p>safe</p><img src=x onerror="alert(1)"><a href="javascript:alert(1)" onclick="alert(1)">bad</a>',
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
assert(
  "addTicket → stored HTML is sanitized",
  t?.description?.includes("<p>safe</p>") &&
    !/img|onerror|onclick|javascript:/i.test(t.description),
)

r = await post("/tickets", {
  title: "smoke ticket with clip",
  projectId: project.id,
  priority: "low",
  type: "bug",
  recordingUrl: "data:video/webm;base64,GkXf",
})
const clip = r.data
assert(
  "addTicket → recording stored behind private media URL",
  typeof clip?.recordingUrl === "string" &&
    clip.recordingUrl.startsWith("/api/media/"),
)
const mediaEndpoint = `${new URL(BASE).origin}${clip.recordingUrl}`
r = await fetch(mediaEndpoint).then(async (res) => ({ status: res.status }))
assert("media → rejects anonymous reads", r.status === 401)
r = await fetch(mediaEndpoint, { headers: { cookie } }).then(async (res) => ({
  status: res.status,
  type: res.headers.get("content-type"),
  bytes: (await res.arrayBuffer()).byteLength,
}))
assert(
  "media → authenticated binary response",
  r.status === 200 && r.type === "video/webm" && r.bytes === 3,
)
r = await fetch(mediaEndpoint, {
  headers: { cookie, range: "bytes=1-2" },
}).then(async (res) => ({
  status: res.status,
  range: res.headers.get("content-range"),
  bytes: (await res.arrayBuffer()).byteLength,
}))
assert(
  "media → byte ranges",
  r.status === 206 && r.range === "bytes 1-2/3" && r.bytes === 2,
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
  "syncToGithub → guarded without a connection",
  r.status === 400 &&
    /Connect your GitHub account/.test(r.error?.message ?? ""),
)

// GitHub OAuth connect — requires GITHUB_CLIENT_ID + APP_SECRET in env.
const ghConfigured = Boolean(
  process.env.GITHUB_CLIENT_ID && process.env.APP_SECRET,
)
if (ghConfigured) {
  r = await call("/github/connect")
  assert(
    "connectGithub → GitHub authorize url",
    /github\.com\/login\/oauth\/authorize/.test(r.data?.url ?? ""),
  )
} else {
  r = await call("/github/connect")
  assert(
    "connectGithub → not configured (no GITHUB_CLIENT_ID/APP_SECRET)",
    r.status === 500 && /not configured/.test(r.error?.message ?? ""),
  )
}

r = await post("/projects", { name: "Smoke Proj", description: "x" })
const np = r.data
assert("addProject → key + token", np?.key && np.token?.startsWith("tsto_pk_"))

r = await patch(`/projects/${np.id}`, { githubRepo: "acme/smoke" })
assert("updateProject → githubRepo saved", r.data?.githubRepo === "acme/smoke")
r = await patch(`/projects/${np.id}`, { githubRepo: "not a repo" })
assert("updateProject → invalid repo 422", r.status === 422)
r = await patch(`/projects/${np.id}`, { githubRepo: null })
assert("updateProject → githubRepo cleared", r.data?.githubRepo == null)

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

r = await del("/me/github")
assert("disconnectGithub", r.data?.githubConnected === false)

r = await patch("/settings/integrations", {
  key: "integration.clickup_import",
  enabled: false,
})
assert(
  "toggle integration off",
  r.data?.key === "integration.clickup_import" && r.data?.enabled === false,
)
r = await post("/import/clickup/teams", { token: "pk_1234567890" })
assert(
  "import → blocked while disabled",
  r.status === 403 && /disabled/.test(r.error?.message ?? ""),
)
r = await patch("/settings/integrations", {
  key: "integration.clickup_import",
  enabled: true,
})
assert(
  "toggle integration back on",
  r.data?.key === "integration.clickup_import" && r.data?.enabled === true,
)
r = await post("/import/clickup/teams", { token: "pk_1234567890" })
assert(
  "import → bad ClickUp token rejected",
  r.status === 502 && /rejected/i.test(r.error?.message ?? ""),
)
r = await call("/import/github/projects")
assert(
  "github import → requires a connection",
  r.status === 400 &&
    /Connect your GitHub account/.test(r.error?.message ?? ""),
)

assert(
  "users never expose githubToken",
  b.users.every((u) => !("githubToken" in u)),
)

r = await post("/tickets/bulk", { action: "delete", ids: [t.id, clip.id] })
assert("deleteTickets (bulk) → cleanup", r.data?.deleted === 2)
r = await fetch(mediaEndpoint, { headers: { cookie } }).then(async (res) => ({
  status: res.status,
}))
assert("deleteTickets → media record removed", r.status === 404)

// widget API — separately scoped, short-lived bearer token + project header
r = await fetch(`${BASE}/widget/issues`, { method: "OPTIONS" })
assert(
  "widget OPTIONS → 204 + CORS",
  r.status === 204 && r.headers.get("access-control-allow-origin") === "*",
)
r = await fetch(`${BASE}/widget/project`, {
  headers: { "x-tesuto-project": project.token },
}).then((x) => x.json())
assert("widget project (public) → name", r.data?.name === project.name)
r = await fetch(
  `${BASE}/widget/project?token=${encodeURIComponent(project.token)}`,
).then((x) => x.json())
assert("widget project → rejects query-string credentials", Boolean(r.error))
r = await fetch(`${BASE}/widget/project`, {
  headers: { "x-tesuto-project": "nope" },
}).then((x) => x.json())
assert(
  "widget project → bad token 401",
  r.error && /token/i.test(r.error.message),
)
let wIssueId = null
const widgetSecret = process.env.TESUTO_WIDGET_SECRET ?? ""
if (widgetSecret) {
  const body = Buffer.from(
    JSON.stringify({
      email: "smoke-host@hearth.test",
      name: "Smoke Host",
      exp: Math.floor(Date.now() / 1000) + 240,
    }),
  ).toString("base64url")
  const signature = createHmac("sha256", widgetSecret)
    .update(body)
    .digest("base64url")
  const assertion = `${body}.${signature}`
  const projectHeaders = {
    "content-type": "application/json",
    "x-tesuto-project": project.token,
  }
  r = await fetch(`${BASE}/widget/bootstrap`, {
    headers: { ...projectHeaders, cookie },
  }).then(async (res) => ({ status: res.status, ...(await res.json()) }))
  assert("dashboard cookie → cannot authenticate widget API", r.status === 401)
  r = await fetch(`${BASE}/widget/auth`, {
    method: "POST",
    headers: projectHeaders,
    body: JSON.stringify({ assertion }),
  }).then((x) => x.json())
  if (r.data?.linked === false) {
    await fetch(`${BASE}/widget/link`, {
      method: "POST",
      headers: projectHeaders,
      body: JSON.stringify({ assertion, email: SMOKE_EMAIL }),
    })
    r = await fetch(`${BASE}/widget/link/verify`, {
      method: "POST",
      headers: projectHeaders,
      body: JSON.stringify({ assertion, email: SMOKE_EMAIL, code: DEV_CODE }),
    }).then((x) => x.json())
  }
  assert("widget signed auth → scoped token", Boolean(r.data?.token))
  const widgetToken = r.data?.token
  r = await fetch(`${BASE}/bootstrap`, {
    headers: { authorization: `Bearer ${widgetToken}` },
  }).then(async (res) => ({ status: res.status, ...(await res.json()) }))
  assert("widget token → cannot authenticate dashboard API", r.status === 401)
  const wh = {
    ...projectHeaders,
    authorization: `Bearer ${widgetToken}`,
  }
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
      screenshot:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      domSnapshot: { selector: "", tag: "", x: 0.5, y: 0.5 },
    }),
  }).then((x) => x.json())
  assert("widget POST → ticket on the board", /-\d+$/.test(r.data?.key))
  wIssueId = r.data?.id
  r = await fetch(`${BASE}/widget/issues/${wIssueId}`, {
    headers: wh,
  }).then((x) => x.json())
  const signedScreenshot = r.data?.screenshotUrl
  assert(
    "widget detail → short-lived signed media URL",
    signedScreenshot?.startsWith("http") &&
      signedScreenshot.includes("/api/media/") &&
      signedScreenshot.includes("signature="),
  )
  r = await fetch(signedScreenshot).then(async (res) => ({
    status: res.status,
    type: res.headers.get("content-type"),
  }))
  assert(
    "signed media URL → works without dashboard cookie",
    r.status === 200 && r.type === "image/png",
  )
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
} else {
  console.log("SKIP  widget API flow (TESUTO_WIDGET_SECRET is unset)")
}

if (wIssueId) await del(`/tickets/${wIssueId}`)
await del(`/projects/${np.id}`)

await post("/auth/sign-out")
cookie = null
r = await call("/bootstrap")
assert("no session cookie → 401", r.status === 401)

console.log(failures ? `\n${failures} failing` : "\nall green")
process.exit(failures ? 1 : 0)
