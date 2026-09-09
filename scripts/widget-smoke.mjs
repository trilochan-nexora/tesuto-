/**
 * Loads public/widget.js into a jsdom window with a stubbed fetch and drives
 * the main flows (sign in → actions → element pick → compose → issue view),
 * asserting the shadow DOM renders the expected structure. Not a substitute for
 * a real browser, but catches runtime errors and wiring bugs.
 *
 *   bun run scripts/widget-smoke.mjs
 */
import { readFileSync } from "node:fs"
import { JSDOM } from "jsdom"

let failures = 0
const ok = (label, cond) => {
  if (!cond) failures++
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`)
}

// ---- fake Tesuto API ----
const COLUMNS = [
  { id: "backlog", label: "Backlog", dot: "x", terminal: false },
  { id: "in_progress", label: "In Progress", dot: "x", terminal: false },
  { id: "done", label: "Done", dot: "x", terminal: true },
]
const issues = []
const comments = []
let seq = 0

function api(method, path, body) {
  const u = new URL(path, "http://t.local")
  const p = u.pathname.replace("/api", "")
  if (p === "/widget/project")
    return { data: { id: "p1", key: "SAND", name: "Asterconsult" } }
  if (p === "/widget/auth" && method === "POST")
    return {
      data: {
        user: { id: "u1", name: body.name, color: "#7c5cff" },
        token: "tok_1",
      },
    }
  if (p === "/widget/auth" && method === "DELETE") return { data: { ok: true } }
  if (p === "/widget/bootstrap")
    return {
      data: {
        project: { id: "p1", key: "SAND", name: "Asterconsult" },
        user: { id: "u1", name: "Dipen Raut", color: "#7c5cff" },
        columns: COLUMNS,
      },
    }
  if (p === "/widget/issues" && method === "GET") {
    const scope = u.searchParams.get("scope")
    const url = u.searchParams.get("url")
    const list = issues.filter((i) => scope !== "page" || i.sourceUrl === url)
    return { data: list }
  }
  if (p === "/widget/issues" && method === "POST") {
    const it = {
      id: `i${++seq}`,
      key: `SAND-${seq}`,
      title: body.title,
      description: body.description,
      status: "backlog",
      statusLabel: "Backlog",
      priority: body.priority,
      sourceUrl: body.sourceUrl,
      screenshotUrl: body.screenshot || null,
      domSnapshot: body.domSnapshot,
      createdAt: new Date().toISOString(),
      reporter: { name: "Dipen Raut", color: "#7c5cff" },
      comments: 0,
    }
    issues.unshift(it)
    return { data: { id: it.id, key: it.key, title: it.title } }
  }
  const m = p.match(/^\/widget\/issues\/([^/]+)(\/comments)?$/)
  if (m) {
    const it = issues.find((i) => i.id === m[1])
    if (m[2]) {
      if (method === "POST") {
        const c = {
          id: `c${++seq}`,
          body: body.body,
          createdAt: new Date().toISOString(),
          author: { id: "u1", name: "Dipen Raut", color: "#7c5cff" },
        }
        comments.push(c)
        return { data: c }
      }
      return { data: comments.filter(() => true) }
    }
    if (method === "PATCH") {
      Object.assign(it, body)
      return { data: { id: it.id, status: it.status, priority: it.priority } }
    }
    return { data: it }
  }
  return { status: 404, data: null, error: { message: "not found" } }
}

const dom = new JSDOM(
  `<!doctype html><html><body><h1 data-testid="hero">Hi</h1><button id="cta">Go</button></body></html>`,
  {
    url: "http://localhost:3001/dashboard",
    pretendToBeVisual: true,
    runScripts: "outside-only",
  },
)
const { window } = dom
window.__TESUTO__ = { token: "tsto_pk_x", origin: "http://t.local" }
window.fetch = async (url, init = {}) => {
  const method = init.method || "GET"
  const body = init.body ? JSON.parse(init.body) : undefined
  const r = api(method, String(url), body)
  return {
    ok: !r.status || r.status < 400,
    status: r.status || 200,
    json: async () => r,
  }
}
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
})
// jsdom lacks getDisplayMedia — widget should degrade gracefully
window.navigator.mediaDevices = undefined
// jsdom lacks elementFromPoint / getBoundingClientRect geometry
const pointTarget = window.document.querySelector("[data-testid=hero]")
window.document.elementFromPoint = () => pointTarget
window.Element.prototype.getBoundingClientRect = () => ({
  top: 10,
  left: 10,
  right: 90,
  bottom: 50,
  width: 80,
  height: 40,
  x: 10,
  y: 10,
})

const code = readFileSync(
  new URL("../public/widget.js", import.meta.url),
  "utf8",
)
window.eval(code)

const root = window.document.documentElement.querySelector("div").shadowRoot
const $ = (s) => root.querySelector(s)
const $$ = (s) => [...root.querySelectorAll(s)]
const tick = () => new Promise((r) => setTimeout(r, 20))

await tick()
ok("fab renders collapsed", !!$(".fab") && $(".panel").style.display === "none")

$(".fab").click()
await tick()
ok("opens to sign-in (no token)", !!$(".form input#si-name"))

$("#si-name").value = "Dipen Raut"
$("#si-email").value = "dipen@x.com"
$("form").dispatchEvent(new window.Event("submit"))
await tick()
await tick()
ok(
  "after sign-in → header shows project name",
  $(".head h1")?.textContent === "Asterconsult",
)
ok("three tabs render", $$(".tabs button").length === 3)
ok("Actions tab: two action cards", $$(".actioncard").length === 2)
ok(
  "footer shows user + Sign out",
  /Dipen Raut/.test($(".userbar")?.textContent || "") &&
    /Sign out/.test($(".userbar")?.textContent || ""),
)
ok(
  "branding: Made by Nexora",
  /Made by\s*N?\s*Nexora/.test($(".powered")?.textContent || ""),
)

// element pick
$(".actioncard.primary").click()
await tick()
ok(
  "pick mode: panel hidden, hint shown",
  $(".panel").style.display === "none" && !!$(".pk-hint"),
)
window.document.dispatchEvent(
  new window.MouseEvent("mousemove", {
    bubbles: true,
    clientX: 20,
    clientY: 20,
  }),
)
await tick()
window.document.dispatchEvent(
  new window.MouseEvent("click", { bubbles: true, clientX: 20, clientY: 20 }),
)
await tick()
await tick()
ok("compose form after pick", !!$("#cp-title"))
ok(
  "compose shows screenshot fallback (no getDisplayMedia)",
  /Add screenshot|can't capture/i.test($("#cp-shot")?.textContent || ""),
)

$("#cp-title").value = "navbar overlaps footer"
$(".form").dispatchEvent(new window.Event("submit"))
await tick()
await tick()
await tick()
ok(
  "after post → Page Issues list has the new issue",
  /navbar overlaps footer/.test($(".body")?.textContent || ""),
)

$(".issue").click()
await tick()
await tick()
ok(
  "issue view: priority + status selects",
  !!$("#ie-prio") && !!$("#ie-status"),
)
ok("issue view: reply box", !!$("#ie-reply"))

$("#ie-reply").value = "on it"
$(".compose").dispatchEvent(new window.Event("submit"))
await tick()
await tick()
ok("reply appears in thread", /on it/.test($(".msgs")?.textContent || ""))

$("#ie-status").value = "in_progress"
$("#ie-status").dispatchEvent(new window.Event("change"))
await tick()
await tick()
ok(
  "status change reflected in header",
  /In Progress/.test($(".head p")?.textContent || ""),
)

// back to list, then theme
$(".head .back").click()
await tick()
ok("back button returns to a tab list", !!$(".tabs"))
$$(".themebar button")[0].click()
await tick()
ok("theme toggle sets data-theme=light", $(".wrap")?.dataset.theme === "light")

// sign out
$(".userbar .signout").click()
await tick()
await tick()
ok("sign out → back to sign-in screen", !!$("#si-name"))

console.log(failures ? `\n${failures} failing` : "\nall green")
process.exit(failures ? 1 : 0)
