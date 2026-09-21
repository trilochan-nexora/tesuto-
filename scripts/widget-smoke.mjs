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
let lastPost = null
let currentUser = { id: "u1", name: "Dipen Raut", color: "#7c5cff" }

function api(method, path, body) {
  const u = new URL(path, "http://t.local")
  const p = u.pathname.replace("/api", "")
  if (p === "/widget/project")
    return { data: { id: "p1", key: "SAND", name: "Asterconsult" } }
  if (p === "/widget/auth" && method === "POST") {
    currentUser = { id: "u1", name: "Dipen Raut", color: "#7c5cff" }
    return { data: { user: currentUser, token: `tok_${currentUser.id}` } }
  }
  if (p === "/widget/bootstrap")
    return {
      data: {
        project: { id: "p1", key: "SAND", name: "Asterconsult" },
        user: currentUser,
        columns: COLUMNS,
      },
    }
  if (p === "/widget/issues" && method === "GET") {
    const scope = u.searchParams.get("scope")
    const url = u.searchParams.get("url")
    // mirrors the server: page scope is the full page picture, anything else
    // ("all") is the viewer's own queue — assigned to them only.
    const list = issues.filter(
      (i) =>
        (scope !== "page" || i.sourceUrl === url) &&
        (scope === "page" || i.assigneeId === currentUser.id),
    )
    return { data: list }
  }
  if (p === "/widget/issues" && method === "POST") {
    lastPost = body
    const it = {
      id: `i${++seq}`,
      key: `SAND-${seq}`,
      title: body.title,
      description: body.description,
      status: "backlog",
      statusLabel: "Backlog",
      priority: body.priority,
      assigneeId: null,
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
window.__TESUTO__ = {
  token: "tsto_pk_x",
  origin: "http://t.local",
  assertion: `${Buffer.from(
    JSON.stringify({
      email: "dipen@x.com",
      name: "Dipen Raut",
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
  ).toString("base64url")}.test-signature`,
}
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
await tick()
ok("fab renders collapsed", !!$(".fab") && $(".panel").style.display === "none")

$(".fab").click()
await tick()
await tick()
ok(
  "opens straight to Actions (no sign-in screen)",
  $(".head h1")?.textContent === "Asterconsult" && !$("#si-name"),
)
ok("three tabs render", $$(".tabs button").length === 3)
ok("Actions tab: three action cards", $$(".actioncard").length === 3)
ok(
  "footer: 'Commenting as <host user>' + Tesuto disconnect",
  /Commenting as/.test($(".userbar")?.textContent || "") &&
    /Dipen Raut/.test($(".userbar")?.textContent || "") &&
    !!$(".userbar .signout"),
)
ok("no Made-by-Nexora branding", !$(".powered"))
// direct record without capture support explains itself, then backs out
$$(".actioncard")[2].click()
await tick()
await tick()
ok(
  "record action without support explains itself",
  /isn't available/.test($(".body")?.textContent || ""),
)
$(".head .back").click()
await tick()
ok("back from recording returns to actions", !!$(".actioncard"))
ok(
  "header has a close button",
  $$(".head .acts button").some(
    (b) => b.getAttribute("aria-label") === "Close",
  ),
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
  "compose form scrolls with sticky submit",
  $(".form")?.classList.contains("scroll") &&
    !!$(".form .btnrow.stick #cp-send"),
)
ok(
  "no record button when capture unsupported",
  !$("#cp-rec-start") &&
    /isn't available/.test($("#cp-rec")?.textContent || ""),
)
ok(
  "compose auto-captures; no 'Add screenshot' button, shows unsupported note",
  /can't capture/i.test($("#cp-shot")?.textContent || "") && !$("#cp-shot-add"),
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
$$(".tabs button")[2].click() // My Issues tab
await tick()
await tick()
ok(
  "My Issues hides unassigned tickets",
  /Nothing assigned to you/.test($(".body")?.textContent || ""),
)
issues[0].assigneeId = "u1" // a teammate assigns it on the board
$$(".tabs button")[0].click() // Actions (non-list, so the next list entry refetches)
await tick()
await tick()
$$(".tabs button")[2].click() // My Issues
await tick()
await tick()
await tick()
ok(
  "assigned ticket appears under My Issues",
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
$$(".head .acts button")[0].click()
await tick()
ok("theme toggle sets data-theme=light", $(".wrap")?.dataset.theme === "light")
$$(".head .acts button")[0].click()
await tick()
ok("theme toggle flips back to dark", $(".wrap")?.dataset.theme === "dark")

// auth: no Hearth sign-in/out inside the panel — identity comes from the
// host page config, and the only session control is Tesuto's own disconnect
ok(
  "no Hearth session controls in the panel",
  ![...root.querySelectorAll("button")].some((b) =>
    /sign (in|out) of hearth/i.test(b.textContent || ""),
  ) && !!$(".userbar .signout"),
)

// pin flow: drops a draggable marker on the page
$$(".tabs button")[0].click() // Actions tab
await tick()
$$(".actioncard")[1].click() // "Pin anywhere"
await tick()
window.document.dispatchEvent(
  new window.MouseEvent("click", { bubbles: true, clientX: 40, clientY: 60 }),
)
await tick()
await tick()
ok(
  "pin drop leaves a .pin-mark on the page and opens the form",
  !!root.querySelector(".pin-mark") && !!$("#cp-title"),
)
ok(
  "dropped pin is draggable",
  root.querySelector(".pin-mark")?.style.cursor === "grab",
)
$("#cp-cancel").click()
await tick()
ok("cancel clears the pin marker", !root.querySelector(".pin-mark"))

// --- screen recording flow (stubbed capture: jsdom has no real media) ---
window.navigator.mediaDevices = {
  getDisplayMedia: async () => ({
    getVideoTracks: () => [],
    getTracks: () => [],
  }),
}
window.MediaRecorder = class {
  constructor(stream, opts) {
    this.stream = stream
    this.mimeType = opts?.mimeType || "video/webm"
    this.ondataavailable = null
    this.onstop = null
  }
  start() {}
  stop() {
    if (this.ondataavailable)
      this.ondataavailable({
        data: new window.Blob(["0123456789"], { type: "video/webm" }),
      })
    if (this.onstop) this.onstop()
  }
}
window.MediaRecorder.isTypeSupported = () => false

$$(".tabs button")[0].click() // Actions tab
await tick()
$$(".actioncard")[1].click() // "Pin anywhere"
await tick()
window.document.dispatchEvent(
  new window.MouseEvent("click", { bubbles: true, clientX: 60, clientY: 80 }),
)
await tick()
await tick()
ok("record button appears when capture is supported", !!$("#cp-rec-start"))
$("#cp-rec-start").click()
await tick()
await tick()
ok("recording state shows a stop control", !!$("#cp-rec-stop"))
$("#cp-rec-stop").click()
let clip = null
for (let i = 0; i < 60 && !clip; i++) {
  await tick()
  clip = $("#cp-rec-vid")
}
ok("finished clip previews as a video", !!clip)
$("#cp-title").value = "recording attached"
$(".form").dispatchEvent(new window.Event("submit"))
await tick()
await tick()
await tick()
await tick()
ok(
  "submit ships the recording",
  typeof lastPost?.recording === "string" &&
    lastPost.recording.startsWith("data:video"),
)

// direct record flow: no element pick, clip lands in compose, ships solo
$$(".tabs button")[0].click() // Actions tab
await tick()
$$(".actioncard")[2].click() // "Record video"
await tick()
await tick()
ok("direct record starts capturing", !!$("#rc-stop"))
$("#rc-stop").click()
let direct = null
for (let i = 0; i < 60 && !direct; i++) {
  await tick()
  direct = $("#cp-rec-vid")
}
ok(
  "stop lands in compose with the clip, no element needed",
  !!direct && /no element picked/i.test($(".form")?.textContent || ""),
)
$("#cp-title").value = "direct video report"
$(".form").dispatchEvent(new window.Event("submit"))
await tick()
await tick()
await tick()
await tick()
ok(
  "direct report ships video without a selector",
  typeof lastPost?.recording === "string" &&
    lastPost?.domSnapshot?.selector === "",
)

// Tesuto disconnect lands on a verified reconnect page without accepting a
// self-claimed name/email, and signing back in restores the actions view.
$(".userbar .signout").click()
await tick()
await tick()
ok(
  "disconnect offers signed-assertion reconnect only",
  !$("#si-name") && !$("#si-email") && !!$("#si-go"),
)
$("#si-go").click()
await tick()
await tick()
await tick()
await tick()
ok("sign-in returns to actions", !!$(".actioncard"))

// --- second window: no host user → the widget refuses to file anything ---
{
  const dom2 = new JSDOM(
    `<!doctype html><html><body><h1>Hi</h1></body></html>`,
    {
      url: "http://localhost:3001/dashboard",
      pretendToBeVisual: true,
      runScripts: "outside-only",
    },
  )
  const w2 = dom2.window
  w2.__TESUTO__ = { token: "tsto_pk_x", origin: "http://t.local" } // no user
  w2.fetch = async (url, init = {}) => {
    const r = api(
      init.method || "GET",
      String(url),
      init.body && JSON.parse(init.body),
    )
    return {
      ok: !r.status || r.status < 400,
      status: r.status || 200,
      json: async () => r,
    }
  }
  w2.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  w2.eval(code)
  await new Promise((r) => setTimeout(r, 40))
  const r2 = w2.document.documentElement.querySelector("div").shadowRoot
  const fab2 = r2.querySelector(".fab")
  ok(
    "no host user → widget renders nothing (button hidden, panel hidden)",
    fab2?.style.display === "none" &&
      r2.querySelector(".panel")?.style.display === "none",
  )
  fab2?.click()
  await new Promise((r) => setTimeout(r, 40))
  ok(
    "no host user → shortcut/click can't open it",
    !r2.querySelector(".actioncard"),
  )
}

// --- third window: verified mode, unlinked host user → link flow ---
{
  let linkLinked = false
  const dom3 = new JSDOM(
    `<!doctype html><html><body><h1>Hi</h1></body></html>`,
    {
      url: "http://localhost:3001/dashboard",
      pretendToBeVisual: true,
      runScripts: "outside-only",
    },
  )
  const w3 = dom3.window
  w3.__TESUTO__ = {
    token: "tsto_pk_x",
    origin: "http://t.local",
    assertion: "AAA.BBB.CCC",
  }
  w3.fetch = async (url, init = {}) => {
    const method = init.method || "GET"
    const body = init.body ? JSON.parse(init.body) : undefined
    const u = new URL(String(url), "http://t.local")
    const p = u.pathname.replace("/api", "")
    const okRes = (data) => ({
      ok: true,
      status: 200,
      json: async () => ({ data, error: null }),
    })
    if (p === "/widget/project")
      return okRes({ id: "p1", key: "SAND", name: "Asterconsult" })
    if (p === "/widget/auth" && method === "POST") {
      if (body?.assertion && !linkLinked)
        return okRes({ linked: false, hostEmail: "sam@hearth.test" })
      return okRes({ user: currentUser, token: "tok_u1", linked: true })
    }
    if (p === "/widget/link" && method === "POST")
      return okRes({ ok: true, email: "r•••@tesuto.test" })
    if (p === "/widget/link/verify" && method === "POST") {
      linkLinked = true
      return okRes({ user: currentUser, token: "tok_u1", linked: true })
    }
    if (p === "/widget/bootstrap")
      return okRes({
        project: { id: "p1", key: "SAND", name: "Asterconsult" },
        user: currentUser,
        columns: COLUMNS,
      })
    if (p === "/widget/issues") return okRes([])
    return {
      ok: false,
      status: 404,
      json: async () => ({ data: null, error: { message: "not found" } }),
    }
  }
  w3.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  w3.eval(code)
  await new Promise((r) => setTimeout(r, 60))
  const r3 = w3.document.documentElement.querySelector("div").shadowRoot
  ok(
    "assertion identity → link view opens (no Hearth login UI)",
    r3.querySelector(".panel")?.style.display !== "none" &&
      !!r3.querySelector("#lk-email"),
  )
  await new Promise((r) => setTimeout(r, 60))
  ok(
    "unlinked host user lands on the link view",
    !!r3.querySelector("#lk-email"),
  )
  r3.querySelector("#lk-email").value = "ram@tesuto.test"
  r3.querySelector(".form").dispatchEvent(new w3.Event("submit"))
  await new Promise((r) => setTimeout(r, 60))
  ok("code step appears after send", !!r3.querySelector("#lk-code"))
  r3.querySelector("#lk-code").value = "123456"
  r3.querySelector(".form").dispatchEvent(new w3.Event("submit"))
  await new Promise((r) => setTimeout(r, 150))
  ok("verify signs in to actions", !!r3.querySelector(".actioncard"))
  r3.querySelector(".userbar .signout")?.click()
  await new Promise((r) => setTimeout(r, 60))
  ok(
    "disconnect shows the continue-as sign-in page",
    !!r3.querySelector("#si-go"),
  )
  r3.querySelector("#si-go").click()
  await new Promise((r) => setTimeout(r, 150))
  ok(
    "continue re-signs in via the remembered link",
    !!r3.querySelector(".actioncard"),
  )
}

console.log(failures ? `\n${failures} failing` : "\nall green")
process.exit(failures ? 1 : 0)
