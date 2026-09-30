/**
 * Tesuto comment/issue widget — standalone, dependency-free.
 *
 *   <script src="https://tesuto.example.com/widget.js"
 *           data-project-token="tsto_pk_…" defer></script>
 *
 * or via the ESM loader:
 *
 *   import { initTesutoWidget } from ".../tesuto-widget.js"
 *   initTesutoWidget({ token: "tsto_pk_…" })
 *
 * A side panel. Identity comes from a short-lived signed assertion minted by
 * the host server (the widget proves nothing itself — Tesuto verifies the
 * signature), and an unknown host user links a Tesuto account once via an
 * emailed code. The Tesuto session is separate from the host session: the footer disconnects
 * only Tesuto, and disconnecting lands on a Tesuto sign-in page.
 * Comment on an element or drop a pin, browse this page's issues or your own
 * queue, open an issue to chat and change its priority / status.
 * Talks to `<origin>/api/widget/*`.
 */
;(() => {
  if (window.__tesutoWidget) return
  window.__tesutoWidget = true

  function lsGet(k) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v)
    } catch {}
  }
  function lsDel(k) {
    try {
      localStorage.removeItem(k)
    } catch {}
  }

  /* --------------------------------- config -------------------------------- */
  const script =
    document.currentScript || document.querySelector('script[src*="widget.js"]')
  const cfg = window.__TESUTO__ || {}
  const attr = (n) => (script && script.getAttribute("data-" + n)) || ""
  const PT_KEY = "tesuto:widget-project-token"
  let TOKEN = lsGet(PT_KEY) || cfg.token || attr("project-token") || ""
  // The host passes a signed identity assertion minted by its own server.
  // Tesuto proves the signature before trusting the identity — see
  // lib/assertion.ts. Without it the widget remains unavailable.
  const CFG_ASSERTION =
    (typeof cfg.assertion === "string" && cfg.assertion) ||
    attr("assertion") ||
    ""

  // The embedding app's display name ("You're signed in to <HOST> as …").
  // The widget ships to any host, so never hardcode one.
  const HOST_NAME =
    (typeof cfg.hostName === "string" && cfg.hostName.trim()) ||
    attr("host-name").trim() ||
    location.hostname ||
    "this app"

  const ID_KEY = "tesuto:widget-identity"

  // Decode the assertion payload for *display only* (who you'd sign in as).
  // Trust still comes from the server-side signature check, never this.
  function decodeAssertion() {
    try {
      if (!CFG_ASSERTION) return null
      const dot = CFG_ASSERTION.indexOf(".")
      if (dot < 1) return null
      let b64 = CFG_ASSERTION.slice(0, dot).replace(/-/g, "+").replace(
        /_/g,
        "/",
      )
      while (b64.length % 4) b64 += "="
      const payload = JSON.parse(atob(b64))
      if (payload && typeof payload.email === "string") {
        return {
          email: payload.email,
          name: typeof payload.name === "string" ? payload.name : "",
        }
      }
    } catch {}
    return null
  }
  function savedIdentity() {
    try {
      const raw = ls.get(ID_KEY)
      if (!raw) return null
      const o = JSON.parse(raw)
      if (o && typeof o.hostEmail === "string") return o
    } catch {}
    return null
  }
  function saveIdentity(hostEmail, name) {
    ls.set(ID_KEY, JSON.stringify({ hostEmail, name: name || "" }))
  }
  const ORIGIN = (
    cfg.origin ||
    attr("origin") ||
    (script && new URL(script.src).origin) ||
    location.origin
  ).replace(/\/$/, "")
  const API = ORIGIN + "/api"
  const SHORTCUT = String(cfg.shortcut || attr("shortcut") || "mod+shift+b")
    .toLowerCase()
    .split("+")

  const THEME_KEY = "tesuto:widget-theme"
  const ls = { get: lsGet, set: lsSet, del: lsDel }

  function prefersLight() {
    try {
      return window.matchMedia("(prefers-color-scheme: light)").matches
    } catch {
      return false
    }
  }

  // The 5-click reveal gesture is for dev/uat/prod embeds out in the wild —
  // on a developer's own machine (host page served from localhost) the
  // launcher should just be there, no secret handshake required.
  function isLocalHost() {
    try {
      return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    } catch {
      return false
    }
  }

  /* ------------------------------- telemetry ------------------------------- */
  const consoleErrors = []
  const failedRequests = []
  const origError = console.error
  console.error = function (...args) {
    try {
      const msg = args
        .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a)))
        .join(" ")
      if (consoleErrors.length < 10 && msg) consoleErrors.push(msg.slice(0, 300))
    } catch {}
    return origError.apply(this, args)
  }
  const origFetch = window.fetch
  if (typeof origFetch === "function") {
    window.fetch = async function (input, init) {
      const method = (init && init.method) || "GET"
      const url = typeof input === "string" ? input : input && input.url
      try {
        const res = await origFetch.apply(this, arguments)
        if (!res.ok && failedRequests.length < 10 && !String(url).includes(API)) {
          failedRequests.push(`${method} ${trimUrl(url)} → ${res.status}`)
        }
        return res
      } catch (e) {
        if (failedRequests.length < 10 && !String(url).includes(API)) {
          failedRequests.push(`${method} ${trimUrl(url)} → network error`)
        }
        throw e
      }
    }
  }
  // Repro steps: the last clicks and in-app navigations before a report, so a
  // developer can replay what the reporter did. Never records typed text or
  // input values; skips the widget itself and the pick/pin click.
  const steps = []
  function pushStep(step) {
    steps.push(Object.assign(step, { at: new Date().toISOString() }))
    if (steps.length > 20) steps.shift()
  }
  document.addEventListener(
    "click",
    (e) => {
      try {
        if (state.view === "pick" || state.view === "pin") return
        const path = e.composedPath ? e.composedPath() : []
        if (path.indexOf(host) !== -1) return
        const el = e.target instanceof Element ? e.target : null
        if (!el) return
        const target =
          el.closest("a,button,[role=button],label,summary,input,select,textarea") || el
        const field = target.matches("input,select,textarea")
        const label = field
          ? target.getAttribute("aria-label") || target.getAttribute("name") || ""
          : target.getAttribute("aria-label") || target.textContent || ""
        pushStep({
          kind: "click",
          target: selectorFor(target).slice(0, 200),
          text: label.trim().replace(/\s+/g, " ").slice(0, 60),
        })
      } catch {}
    },
    true,
  )
  let lastPath = location.pathname + location.search
  function onNav() {
    const now = location.pathname + location.search
    if (now === lastPath) return
    lastPath = now
    pushStep({ kind: "nav", url: now.slice(0, 200) })
  }
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m]
    history[m] = function () {
      const r = orig.apply(this, arguments)
      onNav()
      return r
    }
  }
  window.addEventListener("popstate", onNav)
  window.addEventListener("hashchange", onNav)
  function trimUrl(u) {
    if (!u) return "?"
    try {
      const x = new URL(u, location.href)
      return x.pathname + x.search
    } catch {
      return String(u).slice(0, 120)
    }
  }

  /* --------------------------------- api ---------------------------------- */
  // Deliberately memory-only: a page script cannot recover a previous widget
  // bearer token from localStorage. A fresh short session is minted on reload.
  let userToken = null

  async function apiRaw(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: {
        "content-type": "application/json",
        "x-tesuto-project": TOKEN,
        ...(userToken ? { authorization: `Bearer ${userToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let json = {}
    try {
      json = await res.json()
    } catch {}
    const msg =
      (json && json.error && json.error.message) || `HTTP ${res.status}`
    if (res.status === 401 && !path.startsWith("/widget/auth")) {
      // session expired (not a bad project token) — re-mint silently
      if (userToken && !/token/i.test(msg)) {
        userToken = null
        state.me = null
        void reconnect()
        throw new Error("unauthorized")
      }
    }
    if (!res.ok || (json && json.error)) {
      const e = new Error(msg)
      e.status = res.status
      throw e
    }
    return json && "data" in json ? json.data : json
  }
  const apiGet = (p) => apiRaw("GET", p)
  const apiPost = (p, b) => apiRaw("POST", p, b || {})
  const apiPatch = (p, b) => apiRaw("PATCH", p, b)

  /* ----------------------------- selector gen ---------------------------- */
  function selectorFor(el) {
    const t = el.getAttribute && el.getAttribute("data-testid")
    if (t) return `[data-testid="${t}"]`
    if (el.id) return `#${el.id}`
    const aria = el.getAttribute && el.getAttribute("aria-label")
    if (aria) return `[aria-label="${aria}"]`
    const tag = el.tagName.toLowerCase()
    const parent = el.parentElement
    if (!parent) return tag
    const sibs = [...parent.children].filter((c) => c.tagName === el.tagName)
    if (sibs.length <= 1) return tag
    return `${tag}:nth-of-type(${sibs.indexOf(el) + 1})`
  }

  /* ----------------------------- screenshot ----------------------------- */
  // Draw a mouse-pointer glyph with its tip at (x, y).
  function drawCursor(ctx, x, y, s) {
    const pts = [
      [0, 0],
      [0, 16.8],
      [4.1, 12.9],
      [7.1, 19.8],
      [9.9, 18.6],
      [6.9, 11.8],
      [12, 11.8],
    ]
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath()
    ctx.lineJoin = "round"
    ctx.lineWidth = 1.4
    ctx.fillStyle = "#fff"
    ctx.strokeStyle = "#111827"
    ctx.shadowColor = "rgba(0,0,0,.35)"
    ctx.shadowBlur = 3
    ctx.fill()
    ctx.shadowColor = "transparent"
    ctx.stroke()
    ctx.restore()
  }

  async function captureScreenshot(picked) {
    const md = navigator.mediaDevices
    if (!md || typeof md.getDisplayMedia !== "function") {
      throw new Error("unsupported")
    }
    const view = picked && picked.view
    // Hide the whole widget *before* the share prompt so it never covers the
    // thing you're trying to capture — restored once we have the frame.
    const prevVis = host.style.visibility
    host.style.visibility = "hidden"
    let stream
    try {
      try {
        stream = await md.getDisplayMedia({
          video: true,
          audio: false,
          preferCurrentTab: true,
        })
      } catch (e) {
        if (e && e.name === "InvalidStateError") {
          stream = await md.getDisplayMedia({ video: true, audio: false })
        } else {
          throw e
        }
      }
    } catch (e) {
      host.style.visibility = prevVis
      throw e
    }
    const raw = document.createElement("canvas")
    let sw
    let sh
    try {
      await new Promise((r) => setTimeout(r, 80))
      const track = stream.getVideoTracks()[0]
      let source
      if (typeof window.ImageCapture === "function") {
        const bitmap = await new window.ImageCapture(track).grabFrame()
        source = bitmap
        sw = bitmap.width
        sh = bitmap.height
      } else {
        const video = document.createElement("video")
        video.muted = true
        video.playsInline = true
        video.style.cssText =
          "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px"
        video.srcObject = stream
        document.documentElement.appendChild(video)
        await video.play().catch(() => {})
        await new Promise((r) => setTimeout(r, 250))
        source = video
        sw = video.videoWidth || 1280
        sh = video.videoHeight || 720
        video.remove()
      }
      raw.width = sw
      raw.height = sh
      raw.getContext("2d").drawImage(source, 0, 0)
    } finally {
      host.style.visibility = prevVis
      stream.getTracks().forEach((t) => t.stop())
    }

    const scale = Math.min(1, 1600 / sw)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(sw * scale)
    canvas.height = Math.round(sh * scale)
    const ctx = canvas.getContext("2d")
    ctx.drawImage(raw, 0, 0, canvas.width, canvas.height)
    if (view && view.vw && view.vh) {
      const arCap = sw / sh
      const arView = view.vw / view.vh
      if (Math.abs(arCap - arView) / arView < 0.12) {
        const kx = canvas.width / view.vw
        const ky = canvas.height / view.vh
        if (picked && picked.pin) {
          drawCursor(
            ctx,
            (view.x + 13) * kx,
            (view.y + 26) * ky,
            Math.min(2.4, Math.max(1.25, canvas.width / 1100)),
          )
        } else {
          ctx.lineWidth = Math.max(2, Math.round(canvas.width / 480))
          ctx.strokeStyle = "#ef4444"
          ctx.fillStyle = "rgba(239,68,68,0.14)"
          ctx.fillRect(view.x * kx, view.y * ky, view.w * kx, view.h * ky)
          ctx.strokeRect(view.x * kx, view.y * ky, view.w * kx, view.h * ky)
        }
      }
    }
    return canvas.toDataURL("image/jpeg", 0.9)
  }

  /* --------------------------------- ui shell ---------------------------- */
  const host = document.createElement("div")
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;pointer-events:none"
  document.documentElement.appendChild(host)
  const root = host.attachShadow({ mode: "open" })

  const ACCENT = "#18181b"
  root.innerHTML = `
<style>
  :host { all: initial }
  /* shadow DOM doesn't inherit the host page's ::selection — theme it here */
  ::selection { background: rgba(161,161,170,.35); color: inherit }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif }
  .wrap { --bg:#0d0d10; --panel:#151519; --card:#1b1b21; --line:#26262e; --text:#f4f4f5;
    --muted:#a1a1aa; --accent:#f4f4f5; --accent-ink:#18181b; --accent-soft:rgba(244,244,245,.14);
    position: fixed; bottom: 20px; right: 20px; pointer-events: auto; color: var(--text) }
  .wrap[data-theme="light"] { --bg:#ffffff; --panel:#f7f7f8; --card:#ffffff; --line:#e4e4e7;
    --text:#18181b; --muted:#71717a; --accent:#18181b; --accent-ink:#ffffff;
    --accent-soft:rgba(24,24,27,.08) }

  /* The launcher is a half-circle flush against whichever edge it's docked
     to — it reads as growing out of the edge rather than a circle floating
     near it. Which two corners round off (and which border drops out, so
     there's no seam at the flush side) depends on the docked edge. */
  .fab { position: fixed; width: 44px; height: 44px;
    border: 1px solid var(--accent); background: var(--bg); color: var(--accent); cursor: grab;
    pointer-events: auto; display: grid; place-items: center; box-shadow: 0 10px 30px rgba(0,0,0,.35);
    touch-action: none; user-select: none }
  .fab.dragging { cursor: grabbing; box-shadow: 0 16px 40px rgba(0,0,0,.45) }
  .fab svg { width: 18px; height: 18px; pointer-events: none }
  .fab[data-edge="right"] { border-radius: 50% 0 0 50%; border-right: none }
  .fab[data-edge="left"] { border-radius: 0 50% 50% 0; border-left: none }
  .fab[data-edge="top"] { border-radius: 0 0 50% 50%; border-top: none }
  .fab[data-edge="bottom"] { border-radius: 50% 50% 0 0; border-bottom: none }

  .panel { position: fixed; bottom: 20px; right: 20px; width: 340px; max-width: calc(100vw - 32px);
    height: 520px; max-height: calc(100vh - 32px); pointer-events: auto; display: flex; flex-direction: column;
    background: var(--bg); border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
    box-shadow: 0 24px 60px rgba(0,0,0,.4) }

  .head { background: linear-gradient(160deg, #3f3f46, ${ACCENT}); color: #fff; padding: 18px 18px 14px }
  .head .row { display: flex; align-items: flex-start; gap: 10px }
  .head .ttl { min-width: 0; flex: 1 }
  .head h1 { margin: 0; font-size: 19px; font-weight: 700; line-height: 1.2;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .head p { margin: 3px 0 0; font-size: 12.5px; color: rgba(255,255,255,.8);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .head .back { background: rgba(255,255,255,.12); border: none; color: #fff; cursor: pointer; flex: none;
    width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; margin-right: 2px }
  .head .back:hover { background: rgba(255,255,255,.22) }
  .head .back svg { width: 16px; height: 16px }
  .head .idico { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
    font-size: 12px; font-weight: 700; color: #fff; flex: none }
  .head .acts { margin-left: auto; display: flex; gap: 4px; flex: none }
  .head .acts button { background: rgba(255,255,255,.12); border: none; color: #fff; cursor: pointer;
    width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center }
  .head .acts button:hover { background: rgba(255,255,255,.22) }
  .head .acts svg { width: 15px; height: 15px }

  .tabs { display: flex; gap: 4px; padding: 0 12px; border-bottom: 1px solid var(--line); background: var(--bg) }
  .tabs button { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 13px;
    font-weight: 600; padding: 12px 8px; display: inline-flex; align-items: center; gap: 6px;
    border-bottom: 2px solid transparent; margin-bottom: -1px }
  .tabs button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent) }
  .tabs svg { width: 14px; height: 14px }
  .tabs .count { background: #ef4444; color: #fff; border: none;
    font-size: 11px; font-weight: 700; border-radius: 999px; padding: 0 6px; min-width: 18px; text-align: center }

  .body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 14px }

  .actioncard { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;
    padding: 16px; border-radius: 14px; border: 1px solid var(--line); background: var(--card);
    color: var(--text); cursor: pointer; margin-bottom: 12px }
  .actioncard.primary { background: var(--accent); border-color: transparent; color: var(--accent-ink) }
  .actioncard .ico { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
    background: var(--accent-soft); flex: none }
  .actioncard.primary .ico { background: color-mix(in srgb, var(--accent-ink) 18%, transparent) }
  .actioncard .ico svg { width: 20px; height: 20px }
  .actioncard h3 { margin: 0; font-size: 15px; font-weight: 700 }
  .actioncard.primary h3 { color: var(--accent-ink) }
  .actioncard:not(.primary) h3 { color: var(--accent) }
  .actioncard p { margin: 2px 0 0; font-size: 12.5px; color: var(--muted) }
  .actioncard.primary p { color: color-mix(in srgb, var(--accent-ink) 80%, transparent) }
  .actioncard .chev { margin-left: auto; color: currentColor; opacity: .6 }

  .issue { display: flex; gap: 10px; width: 100%; text-align: left; padding: 11px 10px; border: none;
    background: none; color: var(--text); cursor: pointer; border-radius: 10px }
  .issue:hover { background: var(--card) }
  .issue .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; background: var(--muted) }
  .issue .t { font-size: 13.5px; font-weight: 600; line-height: 1.35 }
  .issue .m { font-size: 11.5px; color: var(--muted); margin-top: 3px; display: flex; gap: 8px; flex-wrap: wrap }
  .issue .chev { margin-left: auto; color: var(--muted); align-self: center }
  .empty { color: var(--muted); font-size: 13px; text-align: center; padding: 28px 12px }

  .msgs { display: flex; flex-direction: column; gap: 12px }
  .msg { display: flex; flex-direction: column; align-items: flex-start }
  .msg .bub { display: flex; flex-direction: column; gap: 8px; background: var(--card); border-radius: 12px;
    padding: 9px 12px; font-size: 13.5px; line-height: 1.45; white-space: pre-wrap;
    word-break: break-word; max-width: 88% }
  .msg.me { align-items: flex-end }
  .msg.me .bub { background: var(--accent); color: var(--accent-ink) }
  .msg .by { font-size: 11.5px; color: var(--muted); margin-top: 5px; display: flex; align-items: center; gap: 6px }
  .msg .av { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
    font-size: 8px; font-weight: 700; color: #fff }
  .sys { color: var(--muted); font-size: 12px; text-align: center }
  .msg-copy:empty { display: none }
  .msg-files { display: flex; flex-direction: column; gap: 6px; min-width: min(240px, 68vw) }
  .voice-note { display: flex; flex-direction: column; gap: 5px }
  .voice-note span { font-size: 10.5px; font-weight: 700; opacity: .72 }
  .voice-note audio { display: block; width: 240px; max-width: 100%; height: 34px }
  .file-link { display: grid; grid-template-columns: 28px minmax(0,1fr); gap: 8px; align-items: center;
    padding: 7px 9px; border-radius: 8px; color: inherit; background: color-mix(in srgb, currentColor 8%, transparent);
    text-decoration: none; white-space: normal }
  .file-link:hover { background: color-mix(in srgb, currentColor 13%, transparent) }
  .file-link svg { width: 17px; height: 17px; opacity: .72 }
  .file-link b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px }
  .file-link small { display: block; font-size: 10px; opacity: .68 }

  .foot { border-top: 1px solid var(--line); background: var(--bg) }
  /* issue view */
  .iv-sec { margin-bottom: 16px }
  .iv-lbl { margin: 0 0 6px; font-size: 10.5px; font-weight: 700; letter-spacing: .06em;
    text-transform: uppercase; color: var(--muted) }
  .shotwrap { position: relative; border-radius: 8px; overflow: hidden; border: 1px solid var(--line);
    background: var(--card); cursor: zoom-in }
  .shotwrap img { display: block; width: 100%; height: auto }
  .hl { position: absolute; border: 2px solid #ef4444; border-radius: 3px; pointer-events: none;
    box-shadow: 0 0 0 9999px rgba(0,0,0,.32) }
  .iv-rec { display: block; width: 100%; border-radius: 8px; border: 1px solid var(--line);
    background: #000; margin-top: 8px }
  .facts { display: grid; grid-template-columns: 64px minmax(0,1fr); gap: 7px 10px; margin: 0;
    padding: 10px 12px; border-radius: 10px; background: var(--card); border: 1px solid var(--line); font-size: 12px }
  .facts dt { color: var(--muted); font-weight: 600 }
  .facts dd { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text) }
  .facts dd a { color: var(--text); text-decoration: underline; text-underline-offset: 2px }
  .facts code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11.5px }
  .dupe { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin: 10px 0 4px;
    padding: 10px 12px; border-radius: 10px; font-size: 12px; color: var(--text);
    background: rgba(245,158,11,.12); border: 1px solid rgba(245,158,11,.35) }
  .dupe span { color: var(--muted) }
  .dupe .linkbtn { margin: 0; text-align: left; color: var(--text); text-decoration: underline }
  .steps { margin: 0; padding: 10px 12px 10px 30px; border-radius: 10px; background: var(--card);
    border: 1px solid var(--line); font-size: 12px; display: flex; flex-direction: column; gap: 5px }
  .steps li { display: flex; justify-content: space-between; gap: 8px }
  .steps li > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .steps code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; color: var(--muted) }
  .steps .when { flex: none; color: var(--muted); font-size: 11px }
  .triage { display: grid; grid-template-columns: 1fr 1fr; gap: 8px }
  .triage label { display: flex; flex-direction: column; gap: 5px; font-size: 10.5px; font-weight: 700;
    letter-spacing: .06em; text-transform: uppercase; color: var(--muted) }
  .triage select { background: var(--card); color: var(--text); border: 1px solid var(--line); border-radius: 8px;
    padding: 7px 9px; font-size: 13px; font-weight: 400; font-family: inherit; letter-spacing: 0; text-transform: none }
  .ctxbox { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--card);
    border: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px }
  .ctxbox .envline { font-size: 11.5px; color: var(--muted) }
  .ctxbox .ctxtitle { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; color: var(--muted);
    text-transform: uppercase }
  .ctxbox code.errline { display: block; font-size: 11px; font-family: ui-monospace, SFMono-Regular, monospace;
    color: #ef4444; white-space: pre-wrap; word-break: break-word }
  .ctxbox code.reqline { display: block; font-size: 11px; font-family: ui-monospace, SFMono-Regular, monospace;
    color: var(--muted); white-space: pre-wrap; word-break: break-word }

  .compose { display: flex; flex-direction: column; gap: 7px; padding: 9px 10px 10px }
  .compose-row { display: flex; flex-flow: row nowrap; align-items: flex-end; gap: 7px; width: 100% }
  .compose textarea { flex: 1 1 auto; width: auto; min-width: 0; min-height: 38px; max-height: 96px; resize: none; background: var(--card);
    color: var(--text); border: 1px solid var(--line); border-radius: 10px; padding: 9px 10px;
    font-size: 13px; line-height: 1.35; font-family: inherit; outline: none }
  .compose textarea:focus { border-color: var(--accent) }
  .compose-tools { display: flex; flex: none; align-items: center; gap: 2px }
  .compose .att { width: 32px; height: 32px; display: grid; place-items: center; background: none; border: none;
    border-radius: 8px; color: var(--muted); cursor: pointer; padding: 0 }
  .compose .att:hover { color: var(--text); background: var(--card) }
  .compose .att.active { color: #ef4444; background: rgba(239,68,68,.1) }
  .compose .att svg { width: 16px; height: 16px }
  .compose .send { width: 38px; height: 38px; border-radius: 9px; border: none; background: var(--accent);
    color: var(--accent-ink); cursor: pointer; display: grid; place-items: center; flex: none }
  .compose .send svg { width: 16px; height: 16px }
  .compose .send[disabled] { opacity: .45; cursor: default }
  .compose-staged { display: flex; flex-direction: column; gap: 5px }
  .stage-row { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 6px 8px;
    border-radius: 8px; background: var(--card); color: var(--muted); font-size: 11px }
  .stage-row > svg { width: 15px; height: 15px; flex: none }
  .stage-row .stage-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text) }
  .stage-row button { width: 24px; height: 24px; display: grid; place-items: center; border: none; border-radius: 6px;
    background: transparent; color: var(--muted); cursor: pointer }
  .stage-row button:hover { color: var(--text); background: var(--bg) }
  .stage-row button svg { width: 13px; height: 13px }
  .stage-row audio { width: 150px; max-width: 50%; height: 30px }
  .compose-error { margin: 0; color: #ef4444; font-size: 11px }

  .userbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px;
    border-top: 1px solid var(--line); font-size: 12.5px; color: var(--muted) }
  .userbar .signout { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 12.5px;
    display: inline-flex; align-items: center; gap: 6px }
  .userbar .signout svg { width: 14px; height: 14px }

  /* forms */
  .form { padding: 16px }
  /* the compose form can outgrow the fixed panel (screenshot + clip
     previews) — it scrolls, with the actions pinned to the bottom */
  .form.scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain }
  .form .btnrow.stick { position: sticky; bottom: -16px; background: var(--bg); padding: 10px 0 4px }
  .form h2 { margin: 0 0 4px; font-size: 15px }
  .form .sel { font: 500 11px/1.4 ui-monospace, monospace; color: var(--muted); word-break: break-all; margin-bottom: 12px }
  .form label { display: block; font-size: 11px; font-weight: 700; color: var(--muted); margin: 10px 0 4px }
  .form input, .form textarea, .form select { width: 100%; background: var(--card); color: var(--text);
    border: 1px solid var(--line); border-radius: 9px; padding: 9px 10px; font-size: 13px; font-family: inherit; outline: none }
  .form textarea { resize: vertical; min-height: 56px }
  .form .btnrow { display: flex; gap: 8px; margin-top: 14px }
  .btn { flex: 1; padding: 10px; border-radius: 9px; border: none; cursor: pointer; font-size: 13px; font-weight: 700 }
  .btn.primary { background: var(--accent); color: var(--accent-ink) }
  .btn.ghost { background: transparent; border: 1px solid var(--line); color: var(--text) }
  .btn[disabled] { opacity: .55; cursor: default }
  .shot-status { margin-top: 3px; padding: 10px; border-radius: 8px; background: var(--card); color: var(--muted); font-size: 12px }
  .shot-img { display: block; width: 100%; border-radius: 8px; border: 1px solid var(--line); margin-top: 4px }
  .capture-tools { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 5px }
  .capture-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 8px;
    padding: 7px 9px; background: var(--card); color: var(--text); font: 600 11.5px/1.2 inherit; cursor: pointer }
  .capture-btn:hover { border-color: var(--accent) }
  .capture-btn.active { color: #ef4444; border-color: rgba(239,68,68,.45); background: rgba(239,68,68,.08) }
  .capture-btn svg { width: 15px; height: 15px }
  .capture-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px }
  .capture-list .stage-row { border: 1px solid var(--line) }
  .linkbtn { background: none; border: none; color: var(--accent); font-size: 11.5px; font-weight: 700; cursor: pointer; margin-top: 6px; padding: 0 }
  .note { font-size: 11px; color: var(--muted); margin-top: 10px }
  .err { color: #f87171 }

  /* page overlays for pick / pin — one brand color throughout; the picked
     element's kind (interactive / text / structure) reads from the border's
     PATTERN (solid / dashed / dotted), not a rainbow of hues */
  .pk-overlay { position: fixed; border: 2px solid ${ACCENT}; pointer-events: none; border-radius: 4px;
    z-index: 2147483001; animation: pk-pulse 1.6s ease-in-out infinite }
  .pk-overlay[data-kind="text"] { border-style: dashed }
  .pk-overlay[data-kind="structure"] { border-style: dotted }
  @keyframes pk-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .68 } }
  @media (prefers-reduced-motion: reduce) {
    .pk-overlay { animation: none }
  }
  .pk-tag { position: absolute; top: -24px; left: 0; display: flex; align-items: center; gap: 5px;
    background: #18181b; color: #fff; font: 500 11px/1 ui-monospace, monospace; padding: 4px 7px 4px 6px;
    border-radius: 4px; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,.35) }
  .pk-tag .pk-dot { width: 6px; height: 6px; border-radius: 50%; background: ${ACCENT}; flex-shrink: 0 }
  .pk-tag .pk-dot[data-kind="text"] { width: 5px; height: 5px; background: transparent; border: 1.5px solid ${ACCENT} }
  .pk-tag .pk-dot[data-kind="structure"] { border-radius: 1.5px }
  .pk-tag .pk-dim { color: #a1a1aa; font-weight: 400 }
  .pk-hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #18181b; color: #fff;
    font-size: 12.5px; padding: 8px 14px; border-radius: 999px; pointer-events: none; z-index: 2147483002;
    box-shadow: 0 8px 24px rgba(0,0,0,.3) }
  .pin-mark { position: fixed; width: 28px; height: 28px; margin: -28px 0 0 -14px; z-index: 2147483001; pointer-events: none;
    color: ${ACCENT}; animation: pin-drop .18s cubic-bezier(.2,.8,.3,1) }
  .pin-mark svg { width: 28px; height: 28px; display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)) }
  @keyframes pin-drop { from { transform: translateY(-8px) scale(.7); opacity: 0 } to { transform: none; opacity: 1 } }

  /* Full-size screenshot preview. window.open() can't be used here — most
     browsers refuse to navigate a new tab to a data: URL and silently land
     on about:blank, so the full image opens in-page instead. */
  .img-lightbox { position: fixed; inset: 0; z-index: 2147483003; background: rgba(0,0,0,.78);
    display: flex; align-items: center; justify-content: center; padding: 24px; cursor: zoom-out;
    pointer-events: auto }
  .lb-frame { position: relative; display: inline-block; max-width: 100%; cursor: default }
  .lb-frame img { display: block; max-width: calc(100vw - 48px); max-height: calc(100vh - 48px);
    border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,.5) }
  .img-lightbox .close { position: fixed; top: 16px; right: 16px; width: 36px; height: 36px;
    border-radius: 50%; border: none; background: rgba(255,255,255,.14); color: #fff;
    display: grid; place-items: center; cursor: pointer }
  .img-lightbox .close:hover { background: rgba(255,255,255,.24) }
  .img-lightbox .close svg { width: 18px; height: 18px }
</style>`

  /* -------------------------------- icons -------------------------------- */
  const I = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    pinFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5" fill="#fff"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    chevD: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    // The launcher's own icon — deliberately not a chevron: host apps
    // commonly have their own "scroll to top" chevron fab in the same
    // corner, and the two were getting mistaken for each other.
    bubble: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3C7.03 3 3 6.58 3 11c0 2.24 1.02 4.27 2.7 5.77L5 21l4.3-1.53c.85.22 1.75.34 2.7.34 4.97 0 9-3.58 9-8s-4.03-8-9-8Z"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
    clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5 12.5 21a4 4 0 0 1-6-6l9-9a3 3 0 0 1 4 4l-9 9a2 2 0 0 1-3-3l8-8"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    rec: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  }

  const PRIORITIES = ["urgent", "high", "medium", "low"]
  const plabel = (p) => p[0].toUpperCase() + p.slice(1)
  // Screen recordings: capped so a clip stays emailable-sized and Postgres-safe.
  const REC_MAX_S = 60
  const REC_MAX_BYTES = 10 * 1024 * 1024
  const VOICE_MAX_S = 60
  const VOICE_MAX_BYTES = 8 * 1024 * 1024
  const FILE_MAX_BYTES = 5 * 1024 * 1024
  const FILE_MAX_COUNT = 3
  const FILE_ACCEPT = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "video/webm",
    "video/mp4",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "application/pdf",
    "application/json",
    "application/zip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ]
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    )
  }
  function initials(name) {
    return (name || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
  }
  function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : PURPLE
  }
  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ""))
      return url.protocol === "http:" || url.protocol === "https:"
        ? url.href
        : ""
    } catch {
      return ""
    }
  }
  function safeImageData(value) {
    const source = String(value || "")
    return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(source)
      ? source
      : ""
  }
  function safeImageUrl(value) {
    return safeImageData(value) || safeHttpUrl(value)
  }
  function fileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener("load", () => resolve(String(reader.result || "")))
      reader.addEventListener("error", () => reject(reader.error || new Error("Couldn't read file")))
      reader.readAsDataURL(file)
    })
  }
  function ago(iso) {
    const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000)
    if (s < 60) return "now"
    if (s < 3600) return `${Math.floor(s / 60)}m`
    if (s < 86400) return `${Math.floor(s / 3600)}h`
    return `${Math.floor(s / 86400)}d`
  }

  /* -------------------------------- state -------------------------------- */
  const state = {
    view: "collapsed", // collapsed | tokenprompt | actions | page | all | pick | pin | compose | issue | link | recording | signin
    theme: ls.get(THEME_KEY) || (prefersLight() ? "light" : "dark"),
    badToken: false,
    authError: false,
    noUser: false, // host app didn't identify a user → can't file anything
    manualDisconnect: false, // user killed the Tesuto session; don't auto-reconnect
    link: null, // { hostEmail, step: "email"|"code", email, err } while linking
    project: null,
    me: null,
    columns: [],
    picked: null, // { selector, tag, text, rect, view } | { pin:{x,y} }
    shot: null,
    shotState: "idle",
    lastShotErr: "",
    rec: null, // screen-recording data URL, attached on submit
    recState: "idle", // idle | starting | recording | error
    recErr: "",
    reportFiles: [],
    reportVoice: null,
    reportVoiceState: "idle",
    reportVoiceErr: "",
    reportUploadErr: "",
    issues: { page: [], all: [] },
    issue: null,
    issueFrom: "page", // which tab openIssue() was called from
    thread: [],
    threadTimer: null,
    scrollThreadToEnd: false,
    replyFiles: [],
    replyVoice: null,
    replyVoiceState: "idle",
    replyVoiceErr: "",
    replyUploadErr: "",
    // Fab stays hidden until the corner click-gesture fires (see hotspot) —
    // always on for a localhost host page, and also for a host that opts in
    // via `alwaysVisible`/`data-always-visible` (a trusted internal app
    // embedding the widget for its own staff, not a public page "in the
    // wild" — the gesture's actual target, per the note on isLocalHost()).
    unlocked: isLocalHost() || cfg.alwaysVisible === true || attr("always-visible") === "true",
  }

  const wrap = document.createElement("div")
  wrap.className = "wrap"
  wrap.dataset.theme = state.theme
  wrap.style.cssText = "position:static;pointer-events:none"
  root.appendChild(wrap)

  const fab = document.createElement("button")
  fab.className = "fab"
  // Hidden until the first render() — the boot requests (project, auth,
  // bootstrap) are slow on a cold dev server, and an unpositioned, icon-less
  // .fab would otherwise flash as an empty dark box in the meantime.
  fab.style.display = "none"
  fab.addEventListener("click", () => {
    // A drag ends with a click on the same element — swallow that one.
    if (fabDragged) {
      fabDragged = false
      return
    }
    if (state.view === "collapsed") go("actions")
    else collapse()
  })
  wrap.appendChild(fab)

  // Draggable launcher bubble — constrained to the four screen edges, like a
  // chat head: while dragging it tracks the pointer but stays flush against
  // whichever edge is nearest (see the half-circle `.fab[data-edge]` rules),
  // sliding along it and hopping to an adjacent edge near a corner, rather
  // than floating freely mid-screen. Position is stored as {edge, frac}
  // (frac = 0..1 along that edge) so it stays valid across window resizes;
  // the default (never moved) docks bottom-right on the right edge.
  const FAB_POS_KEY = "tesuto:widget-fab-pos"
  const FAB_EDGE_GAP = 0 // flush against the edge — no floating gap
  const FAB_PERP_MARGIN = 12 // clearance from the corners along that edge
  const PANEL_GAP = 20 // the open panel keeps a real margin, unlike the bubble
  const DRAG_THRESHOLD = 4 // px of movement before a press counts as a drag
  const DEFAULT_FAB_POS = { edge: "right", frac: 1 }
  let fabPos = DEFAULT_FAB_POS
  let fabDrag = null
  let fabDragged = false
  try {
    const raw = JSON.parse(ls.get(FAB_POS_KEY) || "null")
    if (
      raw &&
      ["left", "right", "top", "bottom"].includes(raw.edge) &&
      typeof raw.frac === "number"
    )
      fabPos = raw
  } catch {}
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))
  function edgeFromPoint(x, y, w, h) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const d = { left: x, right: vw - x, top: y, bottom: vh - y }
    const edge = Object.keys(d).reduce((a, b) => (d[a] < d[b] ? a : b))
    const along =
      edge === "left" || edge === "right"
        ? clamp(
            (y - h / 2 - FAB_PERP_MARGIN) / Math.max(1, vh - h - 2 * FAB_PERP_MARGIN),
            0,
            1,
          )
        : clamp(
            (x - w / 2 - FAB_PERP_MARGIN) / Math.max(1, vw - w - 2 * FAB_PERP_MARGIN),
            0,
            1,
          )
    return { edge, frac: along }
  }
  // Shared dock math for both the bubble (flush, tight corner clearance) and
  // the panel (real margin all round) — same {edge, frac} frame either way.
  function dockStyle(pos, w, h, edgeGap, perpMargin) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (pos.edge === "left" || pos.edge === "right") {
      const top = clamp(
        perpMargin + pos.frac * Math.max(0, vh - h - 2 * perpMargin),
        0,
        Math.max(0, vh - h),
      )
      return { [pos.edge]: edgeGap, top }
    }
    const left = clamp(
      perpMargin + pos.frac * Math.max(0, vw - w - 2 * perpMargin),
      0,
      Math.max(0, vw - w),
    )
    return { [pos.edge]: edgeGap, left }
  }
  function applyFabPos() {
    fab.style.left = fab.style.right = fab.style.top = fab.style.bottom = ""
    fab.dataset.edge = fabPos.edge
    const style = dockStyle(
      fabPos,
      fab.offsetWidth || 44,
      fab.offsetHeight || 44,
      FAB_EDGE_GAP,
      FAB_PERP_MARGIN,
    )
    for (const k in style) fab.style[k] = style[k] + "px"
  }
  // The panel opens against whichever edge the bubble is currently docked
  // to, with a real margin so it doesn't butt up against the browser edge.
  function placePanel() {
    panel.style.left = panel.style.right = panel.style.top = panel.style.bottom = ""
    const style = dockStyle(
      fabPos,
      panel.offsetWidth,
      panel.offsetHeight,
      PANEL_GAP,
      PANEL_GAP,
    )
    for (const k in style) panel.style[k] = style[k] + "px"
  }
  fab.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    fabDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    try {
      fab.setPointerCapture(e.pointerId)
    } catch {}
  })
  fab.addEventListener("pointermove", (e) => {
    if (!fabDrag || e.pointerId !== fabDrag.id) return
    if (!fabDrag.moved) {
      if (Math.hypot(e.clientX - fabDrag.x, e.clientY - fabDrag.y) < DRAG_THRESHOLD)
        return
      fabDrag.moved = true
      fab.classList.add("dragging")
    }
    fabPos = edgeFromPoint(e.clientX, e.clientY, fab.offsetWidth, fab.offsetHeight)
    applyFabPos()
  })
  function endFabDrag(e) {
    if (!fabDrag || e.pointerId !== fabDrag.id) return
    const moved = fabDrag.moved
    fabDrag = null
    fab.classList.remove("dragging")
    if (!moved) return
    // Only a real drag suppresses the click; pointercancel fires no click.
    fabDragged = e.type === "pointerup"
    try {
      ls.set(FAB_POS_KEY, JSON.stringify(fabPos))
    } catch {}
  }
  fab.addEventListener("pointerup", endFabDrag)
  fab.addEventListener("pointercancel", endFabDrag)
  window.addEventListener("resize", () => {
    applyFabPos()
    if (state.view !== "collapsed") placePanel()
  })

  // Hidden reveal gesture: the fab stays invisible until this corner region is
  // clicked 5 times within CLICK_WINDOW_MS. Same behavior in dev and prod — no
  // env flag needed, the gesture itself is the restriction.
  const CLICKS_NEEDED = 5
  const CLICK_WINDOW_MS = 4000
  const HOTSPOT_PX = 90
  let unlockClicks = []
  // The hotspot is a region, not an element: a passive capture-phase listener
  // counts clicks in the corner and never stops them, so host UI that lives
  // there (e.g. a floor-plan settings button) stays clickable while locked.
  function onHotspotClick(e) {
    if (state.unlocked) return
    if (e.clientX < window.innerWidth - HOTSPOT_PX || e.clientY < window.innerHeight - HOTSPOT_PX)
      return
    const now = Date.now()
    unlockClicks = unlockClicks.filter((t) => now - t < CLICK_WINDOW_MS)
    unlockClicks.push(now)
    if (unlockClicks.length >= CLICKS_NEEDED) {
      unlockClicks = []
      state.unlocked = true
      document.removeEventListener("click", onHotspotClick, true)
      go("actions")
    }
  }
  if (!state.unlocked) document.addEventListener("click", onHotspotClick, true)

  const panel = document.createElement("div")
  panel.className = "panel"
  panel.style.display = "none"
  wrap.appendChild(panel)

  const shell = document.createElement("div")
  shell.style.cssText =
    "display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden"
  panel.appendChild(shell)

  function setTheme(t) {
    state.theme = t
    ls.set(THEME_KEY, t)
    wrap.dataset.theme = t
    render()
  }

  /* ----------------------------- navigation ----------------------------- */
  function go(view) {
    const wasList = state.view === "page" || state.view === "all"
    state.view = view
    render()
    // entering a list tab from elsewhere → pull a fresh copy in the background
    if ((view === "page" || view === "all") && !wasList && state.me) {
      void loadIssues().then(() => {
        if (state.view === "page" || state.view === "all") render()
      })
    }
  }
  function collapse() {
    stopPick()
    clearPinMark()
    stopThreadPoll()
    void stopRecording()
    state.view = "collapsed"
    render()
  }

  function render() {
    // The widget is for signed-in users of the host app. No user → show nothing
    // at all (not even the button); the host embed also skips loading it.
    if (state.noUser) {
      panel.style.display = "none"
      fab.style.display = "none"
      return
    }
    const open = state.view !== "collapsed"
    panel.style.display = open ? "flex" : "none"
    fab.style.display = open ? "none" : state.unlocked ? "grid" : "none"
    fab.innerHTML = I.bubble
    if (!open) {
      applyFabPos()
      return
    }
    placePanel()

    shell.innerHTML = ""
    if (state.view === "tokenprompt" || !TOKEN || state.badToken) {
      return renderTokenPrompt()
    }
    if (!state.me) {
      if (state.view === "signin") return renderSignin()
      if (state.view === "link") return renderLink()
      return renderLoading()
    }
    if (state.view === "compose") return renderCompose()
    if (state.view === "issue") return renderIssue()
    if (state.view === "recording") return renderRecording()
    renderMain()
  }

  function renderLoading() {
    const h = document.createElement("div")
    h.className = "head"
    h.innerHTML = `<div class="row"><div class="ttl"><h1>${escapeHtml(
      (state.project && state.project.name) || "Tesuto",
    )}</h1><p>Connecting…</p></div></div>`
    h.querySelector(".row").appendChild(headActs())
    shell.appendChild(h)
    const b = document.createElement("div")
    b.className = "body"
    b.innerHTML = `<div class="empty">${
      state.authError
        ? "Couldn't connect. Check the widget token."
        : "One moment…"
    }</div>`
    shell.appendChild(b)
  }

  function headEl({ back, title, sub, idColor, right } = {}) {
    const h = document.createElement("div")
    h.className = "head"
    const row = document.createElement("div")
    row.className = "row"
    if (back) {
      const b = document.createElement("button")
      b.className = "back"
      b.innerHTML = I.chevL
      b.addEventListener("click", back)
      row.appendChild(b)
    }
    if (idColor) {
      const d = document.createElement("div")
      d.className = "idico"
      d.style.background = safeColor(idColor)
      d.textContent = initials(title)
      row.appendChild(d)
    }
    const box = document.createElement("div")
    box.className = "ttl"
    box.innerHTML = `<h1>${escapeHtml(title)}</h1>${sub ? `<p>${escapeHtml(sub)}</p>` : ""}`
    row.appendChild(box)
    row.appendChild(headActs({ extra: right }))
    h.appendChild(row)
    return h
  }

  // Header action cluster: any view-specific buttons (`extra`), then the
  // light/dark toggle and the close button — always present so the panel can
  // be dismissed and re-themed from anywhere.
  function headActs({ extra } = {}) {
    const acts = document.createElement("div")
    acts.className = "acts"
    if (extra) while (extra.firstChild) acts.appendChild(extra.firstChild)
    const dark = state.theme === "dark"
    const th = document.createElement("button")
    th.innerHTML = dark ? I.moon : I.sun
    th.title = dark ? "Switch to light theme" : "Switch to dark theme"
    th.setAttribute("aria-label", th.title)
    th.addEventListener("click", () => setTheme(dark ? "light" : "dark"))
    acts.appendChild(th)
    const x = document.createElement("button")
    x.innerHTML = I.x
    x.title = "Close"
    x.setAttribute("aria-label", "Close")
    x.addEventListener("click", collapse)
    acts.appendChild(x)
    return acts
  }

  function footEl() {
    const f = document.createElement("div")
    f.className = "foot"
    if (state.me && state.me.name) {
      const ub = document.createElement("div")
      ub.className = "userbar"
      ub.innerHTML = `<span>Commenting as <b style="color:var(--text)">${escapeHtml(
        state.me.name,
      )}</b></span>`
      const out = document.createElement("button")
      out.className = "signout"
      out.innerHTML = `${I.out}<span>Disconnect</span>`
      out.title =
        `Disconnect this browser from Tesuto (${HOST_NAME} stays signed in)`
      out.addEventListener("click", () => {
        void disconnect()
      })
      ub.appendChild(out)
      f.appendChild(ub)
    }
    return f
  }

  // Tesuto-only sign-out: kills the widget session, leaves the host app's
  // session alone. No auto-reconnect until the user hits Connect again.
  async function disconnect() {
    state.manualDisconnect = true
    stopThreadPoll()
    try {
      await apiRaw("DELETE", "/widget/auth")
    } catch {}
    userToken = null
    state.me = null
    state.view = "signin"
    render()
  }

  // The Tesuto sign-in page. Shown after an explicit disconnect — never on a
  // fresh load (a remembered link signs straight back in there).
  function renderSignin() {
    const idn = savedIdentity()
    const asserted = decodeAssertion()
    shell.appendChild(headEl({ title: "Sign in to Tesuto" }))
    if (CFG_ASSERTION) {
      const hostEmail =
        (idn && idn.hostEmail) || (asserted && asserted.email) || ""
      const who = (idn && idn.name) || ""
      const body = document.createElement("div")
      body.className = "body"
      body.innerHTML = `<div class="empty">
        ${
          hostEmail
            ? `${escapeHtml(HOST_NAME)}: <b style="color:var(--text)">${escapeHtml(hostEmail)}</b><br>`
            : ""
        }
        ${
          who
            ? `Tesuto: <b style="color:var(--text)">${escapeHtml(who)}</b><br><br>`
            : "<br>"
        }
        <button type="button" class="btn primary" id="si-go">Sign in</button></div>`
      shell.appendChild(body)
      body.querySelector("#si-go").addEventListener("click", async () => {
        const btn = body.querySelector("#si-go")
        btn.disabled = true
        btn.textContent = "Signing in…"
        state.manualDisconnect = false
        render()
        if (await authSilently()) {
          state.view = "actions"
          await boot()
        }
        render()
      })
      return
    }
    const body = document.createElement("div")
    body.className = "body"
    body.innerHTML = `<div class="empty">This host must provide a signed Tesuto identity assertion.</div>`
    shell.appendChild(body)
  }

  /* ---------------------------- identity ------------------------------ */
  // Verified mode: the host proves its user with a signed assertion. A
  // remembered host→user link signs straight in as the linked Tesuto user;
  // otherwise auth answers `{ linked: false }` and the link flow must run
  // first — nobody files or comments on an unproven identity.
  async function authSilently() {
    if (state.manualDisconnect) return false
    if (CFG_ASSERTION) {
      try {
        const r = await apiPost("/widget/auth", { assertion: CFG_ASSERTION })
        if (r && r.linked === false) {
          userToken = null
          state.noUser = false
          state.link = {
            hostEmail: r.hostEmail || "",
            step: "email",
            email: "",
            err: "",
          }
          state.view = "link"
          return false
        }
        userToken = r.token
        state.noUser = false
        state.link = null
        const idn = decodeAssertion()
        saveIdentity((idn && idn.email) || "", r.user.name)
        return true
      } catch (err) {
        if (err && /token/i.test(err.message || "")) {
          state.badToken = true
        } else {
          state.authError = true
        }
        return false
      }
    }
    userToken = null
    state.noUser = true
    return false
  }

  /* ------------------------- link Tesuto account ------------------------ */
  function renderLink() {
    const link = state.link || {
      hostEmail: "",
      step: "email",
      email: "",
      err: "",
    }
    shell.appendChild(
      headEl({
        title: "Link your Tesuto account",
        sub: link.hostEmail ? `${HOST_NAME}: ${link.hostEmail}` : "",
      }),
    )
    const form = document.createElement("form")
    form.className = "form"
    if (link.step === "email") {
      form.innerHTML = `
        <p class="note" style="margin-top:0">You're signed in to ${escapeHtml(HOST_NAME)} as <b style="color:var(--text)">${escapeHtml(
          link.hostEmail,
        )}</b>. To file issues and comment, link the Tesuto account that belongs to you — we'll email it a code.</p>
        <label>Tesuto email</label>
        <input id="lk-email" type="email" autocomplete="email" placeholder="you@company.com" value="${escapeHtml(
          link.email,
        )}" />
        ${
          link.err ? `<div class="note err">${escapeHtml(link.err)}</div>` : ""
        }
        <div class="btnrow"><button class="btn primary" type="submit" id="lk-send">Email me a code</button></div>`
    } else {
      form.innerHTML = `
        <p class="note" style="margin-top:0">Code sent — check your inbox (valid 10 minutes).</p>
        <label>6-digit code</label>
        <input id="lk-code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="6" />
        ${
          link.err ? `<div class="note err">${escapeHtml(link.err)}</div>` : ""
        }
        <div class="btnrow"><button class="btn ghost" type="button" id="lk-back">Back</button><button class="btn primary" type="submit" id="lk-verify">Verify &amp; continue</button></div>`
    }
    shell.appendChild(form)
    const first = form.querySelector(
      link.step === "email" ? "#lk-email" : "#lk-code",
    )
    if (first) first.focus()
    const back = form.querySelector("#lk-back")
    if (back) {
      back.addEventListener("click", () => {
        state.link.step = "email"
        state.link.err = ""
        render()
      })
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      const btn = form.querySelector("button[type=submit]")
      if (link.step === "email") {
        const email = form.querySelector("#lk-email").value.trim()
        if (!email) return
        btn.disabled = true
        btn.textContent = "Sending…"
        try {
          await apiPost("/widget/link", {
            assertion: CFG_ASSERTION,
            email,
          })
          state.link.email = email
          state.link.step = "code"
          state.link.err = ""
        } catch (err) {
          state.link.err = (err && err.message) || "Couldn't send the code"
        }
        render()
      } else {
        const code = form.querySelector("#lk-code").value.trim()
        if (!code) return
        btn.disabled = true
        btn.textContent = "Verifying…"
        try {
          const r = await apiPost("/widget/link/verify", {
            assertion: CFG_ASSERTION,
            email: state.link.email,
            code,
          })
          userToken = r.token
          const idn = decodeAssertion()
          saveIdentity((idn && idn.email) || "", r.user.name)
          state.link = null
          state.view = "actions"
          await boot()
          render()
        } catch (err) {
          state.link.err = (err && err.message) || "Couldn't verify"
          render()
        }
      }
    })
  }

  /* --------------------------- project token prompt -------------------- */
  function renderTokenPrompt() {
    const h = document.createElement("div")
    h.className = "head"
    h.innerHTML = `<div class="row"><div class="ttl"><h1>Connect Tesuto</h1><p>${
      state.badToken
        ? "That token wasn't recognised."
        : "Paste this project's widget token to start."
    }</p></div></div>`
    h.querySelector(".row").appendChild(headActs())
    shell.appendChild(h)
    const form = document.createElement("form")
    form.className = "form"
    form.innerHTML = `
      <label>Project token</label>
      <input id="tp-token" placeholder="tsto_pk_…" value="${escapeHtml(
        state.badToken ? "" : TOKEN || "",
      )}" />
      <div class="btnrow"><button class="btn primary" type="submit">Connect</button></div>
      <div class="note">Tesuto → a project → “Widget token”.</div>`
    shell.appendChild(form)
    form.querySelector("#tp-token").focus()
    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      const v = form.querySelector("#tp-token").value.trim()
      if (!v) return
      const btn = form.querySelector("button")
      btn.disabled = true
      btn.textContent = "Checking…"
      try {
        TOKEN = v
        const p = await apiGet("/widget/project")
        ls.set(PT_KEY, v)
        state.project = p
        state.badToken = false
        state.authError = false
        if (await authSilently()) await boot()
        go("actions")
      } catch {
        btn.disabled = false
        btn.textContent = "Connect"
        const note = form.querySelector(".note")
        note.textContent = "Not a valid project token."
        note.classList.add("err")
      }
    })
  }

  async function reconnect() {
    stopThreadPoll()
    if (state.manualDisconnect) {
      state.view = "signin"
      state.me = null
      render()
      return
    }
    state.view = state.view === "collapsed" ? "collapsed" : "actions"
    render()
    if (await authSilently()) await boot()
    render()
  }

  /* ------------------------- main (tabs + lists) ------------------------ */
  function renderMain() {
    shell.appendChild(
      headEl({
        title: (state.project && state.project.name) || "Tesuto",
        sub: "Leave a comment on this page",
      }),
    )

    const tabs = document.createElement("div")
    tabs.className = "tabs"
    const mk = (id, label, svg, count) => {
      const b = document.createElement("button")
      b.setAttribute("aria-selected", String(state.view === id))
      b.innerHTML = `${svg} ${escapeHtml(label)}${
        count != null ? ` <span class="count">${count}</span>` : ""
      }`
      b.addEventListener("click", () => go(id))
      return b
    }
    tabs.appendChild(mk("actions", "Actions", I.target))
    tabs.appendChild(
      mk("page", "Page Issues", I.file, state.issues.page.length || 0),
    )
    tabs.appendChild(
      mk("all", "My Issues", I.layers, state.issues.all.length || 0),
    )
    shell.appendChild(tabs)

    const body = document.createElement("div")
    body.className = "body"
    shell.appendChild(body)

    if (state.view === "actions") renderActions(body)
    else renderList(body, state.view)

    shell.appendChild(footEl())
  }

  function renderActions(body) {
    const c1 = document.createElement("button")
    c1.className = "actioncard primary"
    c1.innerHTML = `<span class="ico">${I.target}</span><span><h3>Comment on an element</h3><p>Click the thing you mean</p></span><span class="chev">${I.chevR}</span>`
    c1.addEventListener("click", startPick)
    body.appendChild(c1)

    const c2 = document.createElement("button")
    c2.className = "actioncard"
    c2.innerHTML = `<span class="ico" style="color:#3b82f6;background:rgba(59,130,246,.14)">${I.pin}</span><span><h3>Pin anywhere</h3><p>Drop a pin at any point</p></span><span class="chev">${I.chevR}</span>`
    c2.addEventListener("click", startPin)
    body.appendChild(c2)

    const c3 = document.createElement("button")
    c3.className = "actioncard"
    c3.innerHTML = `<span class="ico" style="color:#ef4444;background:rgba(239,68,68,.14)">${I.rec}</span><span><h3>Record video</h3><p>Capture your screen, no element needed</p></span><span class="chev">${I.chevR}</span>`
    c3.addEventListener("click", () => {
      void startDirectRecording()
    })
    body.appendChild(c3)
  }

  function renderList(body, which) {
    const list = state.issues[which === "page" ? "page" : "all"]
    if (!list.length) {
      body.innerHTML = `<div class="empty">${
        which === "page"
          ? "No issues reported from this page yet."
          : "Nothing assigned to you yet."
      }</div>`
      return
    }
    list.forEach((it) => {
      const b = document.createElement("button")
      b.className = "issue"
      b.innerHTML = `<span class="dot" style="background:${dotFor(it.status)}"></span>
        <span><span class="t">${escapeHtml(it.title)}</span>
        <span class="m"><span>${escapeHtml(it.key)}</span><span>${plabel(
          it.priority,
        )}</span><span>${escapeHtml(it.reporter)}</span><span>${ago(
        it.createdAt,
      )}</span>${it.comments ? `<span>💬 ${it.comments}</span>` : ""}</span></span>
        <span class="chev">${I.chevR}</span>`
      b.addEventListener("click", () => openIssue(it.id))
      body.appendChild(b)
    })
  }
  function dotFor(status) {
    const col = state.columns.find((c) => c.id === status)
    if (!col) return "var(--muted)"
    return col.terminal ? "#10b981" : status === "in_progress" ? "#f59e0b" : ACCENT
  }

  /* ---------------------------- issue detail --------------------------- */
  async function openIssue(id) {
    discardVoice("reply")
    state.replyFiles = []
    state.replyUploadErr = ""
    state.issueFrom = state.view === "all" ? "all" : "page"
    state.view = "issue"
    state.issue = null
    state.thread = []
    render()
    try {
      const [issue, thread] = await Promise.all([
        apiGet(`/widget/issues/${id}`),
        apiGet(`/widget/issues/${id}/comments`),
      ])
      state.issue = issue
      state.thread = thread
      // Opening an issue is primarily a conversation action. Land on the
      // newest message and composer; evidence remains available by scrolling
      // upward. Poll refreshes do not steal the user's current scroll position.
      state.scrollThreadToEnd = true
      render()
      startThreadPoll(id)
    } catch (err) {
      console.error("[tesuto]", err)
    }
  }
  function stopThreadPoll() {
    if (state.threadTimer) clearInterval(state.threadTimer)
    state.threadTimer = null
  }
  function startThreadPoll(id) {
    stopThreadPoll()
    state.threadTimer = setInterval(async () => {
      if (state.view !== "issue" || !state.issue || state.issue.id !== id) return
      try {
        const t = await apiGet(`/widget/issues/${id}/comments`)
        if (t.length !== state.thread.length) {
          state.thread = t
          render()
        }
      } catch {}
    }, 4000)
  }

  // Where the picked element sat on screen at capture time, as % of the
  // viewport — lines up with the screenshot, which is a frame of that viewport.
  function elementBox(snap) {
    const v = snap && snap.view
    if (!v) return null
    const n = [v.x, v.y, v.w, v.h, v.vw, v.vh].map(Number)
    if (n.some((x) => !Number.isFinite(x)) || n[4] <= 0 || n[5] <= 0) return null
    const pct = (a, b) => Math.min(100, Math.max(0, (a / b) * 100))
    return {
      left: pct(n[0], n[4]),
      top: pct(n[1], n[5]),
      width: pct(n[2], n[4]),
      height: pct(n[3], n[5]),
    }
  }
  function boxStyle(b) {
    return `left:${b.left}%;top:${b.top}%;width:${Math.max(b.width, 1.5)}%;height:${Math.max(b.height, 1.5)}%`
  }
  // Raw UA → "Chrome 151 · Linux" (same rules as lib/utils describeUserAgent).
  function describeUserAgent(value) {
    const ua = String(value || "")
    if (!/^Mozilla\//.test(ua)) return ua
    const pick = (re) => (ua.match(re) || [])[1]
    const browser =
      (pick(/Edg\/(\d+)/) && `Edge ${pick(/Edg\/(\d+)/)}`) ||
      (pick(/OPR\/(\d+)/) && `Opera ${pick(/OPR\/(\d+)/)}`) ||
      (pick(/Firefox\/(\d+)/) && `Firefox ${pick(/Firefox\/(\d+)/)}`) ||
      (pick(/Chrome\/(\d+)/) && `Chrome ${pick(/Chrome\/(\d+)/)}`) ||
      (pick(/Version\/(\d+).*Safari/) && `Safari ${pick(/Version\/(\d+).*Safari/)}`) ||
      "Browser"
    const os = /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : ""
    return os ? `${browser} · ${os}` : browser
  }
  // Descriptions written in the dashboard are sanitized rich text; show them
  // as plain text here instead of leaking tags. DOMParser never runs scripts.
  function plainText(html) {
    const s = String(html || "")
    if (!/[<&]/.test(s)) return s
    const doc = new DOMParser().parseFromString(s, "text/html")
    return (doc.body.textContent || "").trim()
  }

  function appendAttachments(parent, attachments) {
    const items = Array.isArray(attachments) ? attachments : []
    if (!items.length) return
    const list = document.createElement("div")
    list.className = "msg-files"
    items.forEach((item) => {
      const url = safeHttpUrl(item && item.url)
      if (!url) return
      if (item.kind === "voice") {
        const voice = document.createElement("div")
        voice.className = "voice-note"
        const label = document.createElement("span")
        label.textContent = "Voice note"
        const audio = document.createElement("audio")
        audio.controls = true
        audio.preload = "metadata"
        audio.src = url
        voice.append(label, audio)
        list.appendChild(voice)
        return
      }
      const link = document.createElement("a")
      link.className = "file-link"
      link.href = url
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      link.download = String(item.name || "attachment")
      link.innerHTML = `${I.file}<span><b>${escapeHtml(item.name || "Attachment")}</b><small>${escapeHtml(
        fileSize(Number(item.size) || 0),
      )}</small></span>`
      list.appendChild(link)
    })
    if (list.childElementCount) parent.appendChild(list)
  }

  function renderCaptureExtras(container, target, withButtons) {
    if (!container) return
    const filesKey = targetState(target, "Files")
    const voiceKey = targetState(target, "Voice")
    const voiceStateKey = targetState(target, "VoiceState")
    const voiceErrorKey = targetState(target, "VoiceErr")
    const uploadErrorKey = targetState(target, "UploadErr")
    const files = state[filesKey]
    const voice = state[voiceKey]
    const voiceState = state[voiceStateKey]
    container.innerHTML = ""

    if (withButtons) {
      const tools = document.createElement("div")
      tools.className = "capture-tools"
      const fileButton = document.createElement("button")
      fileButton.type = "button"
      fileButton.className = "capture-btn"
      fileButton.innerHTML = `${I.clip}<span>Attach files</span>`
      fileButton.disabled = files.length >= FILE_MAX_COUNT
      fileButton.addEventListener("click", () => pickFiles(target))
      const voiceButton = document.createElement("button")
      voiceButton.type = "button"
      voiceButton.className = `capture-btn${voiceState === "recording" ? " active" : ""}`
      voiceButton.innerHTML =
        voiceState === "recording"
          ? `${I.stop}<span>Stop <span id="cp-voice-time">0:00</span></span>`
          : `${I.mic}<span>${voice ? "Record again" : "Record voice"}</span>`
      voiceButton.disabled = voiceState === "starting"
      voiceButton.addEventListener("click", () => {
        if (voiceState === "recording") void stopVoice()
        else void startVoice(target)
      })
      tools.append(fileButton, voiceButton)
      container.appendChild(tools)
    }

    const list = document.createElement("div")
    list.className = "capture-list"
    files.forEach((file, index) => {
      const row = document.createElement("div")
      row.className = "stage-row"
      row.innerHTML = `${I.file}<span class="stage-name">${escapeHtml(file.name)}</span><span>${escapeHtml(
        fileSize(file.size),
      )}</span><button type="button" aria-label="Remove ${escapeHtml(file.name)}">${I.x}</button>`
      row.querySelector("button").addEventListener("click", () => {
        files.splice(index, 1)
        refreshCaptureUi(target)
      })
      list.appendChild(row)
    })
    if (!withButtons && voiceState === "recording") {
      const row = document.createElement("div")
      row.className = "stage-row"
      row.innerHTML = `${I.mic}<span class="stage-name">Recording voice note</span><span id="ie-voice-time">0:00</span>`
      list.appendChild(row)
    }
    if (voice) {
      const row = document.createElement("div")
      row.className = "stage-row"
      row.innerHTML = `${I.mic}<span class="stage-name">Voice note · ${escapeHtml(
        fileSize(voice.size),
      )}</span><button type="button" aria-label="Remove voice note">${I.x}</button>`
      const audio = document.createElement("audio")
      audio.controls = true
      audio.preload = "metadata"
      audio.src = voice.data
      row.insertBefore(audio, row.querySelector("button"))
      row.querySelector("button").addEventListener("click", () => discardVoice(target))
      list.appendChild(row)
    }
    if (list.childElementCount) container.appendChild(list)
    const error = state[voiceErrorKey] || state[uploadErrorKey]
    if (error) {
      const message = document.createElement("p")
      message.className = "compose-error"
      message.textContent = error
      container.appendChild(message)
    }
  }

  function renderReportExtras() {
    renderCaptureExtras(shell.querySelector("#cp-extra"), "report", true)
  }

  function renderReplyExtras(compose) {
    if (!compose) return
    renderCaptureExtras(compose.querySelector(".compose-staged"), "reply", false)
    const voiceButton = compose.querySelector("#ie-voice")
    if (voiceButton) {
      const recording = state.replyVoiceState === "recording"
      voiceButton.classList.toggle("active", recording)
      voiceButton.innerHTML = recording ? I.stop : I.mic
      voiceButton.title = recording ? "Stop voice note" : "Record voice note"
      voiceButton.setAttribute("aria-label", voiceButton.title)
    }
    const reply = compose.querySelector("#ie-reply")
    const send = compose.querySelector(".send")
    if (send) {
      send.disabled = !(
        (reply && reply.value.trim()) ||
        state.replyFiles.length ||
        state.replyVoice ||
        state.replyVoiceState === "recording"
      )
    }
  }

  function renderIssue() {
    const it = state.issue
    if (!it) {
      shell.appendChild(
        headEl({ back: () => go(state.issueFrom || "page"), title: "Loading…" }),
      )
      const b = document.createElement("div")
      b.className = "body"
      shell.appendChild(b)
      return
    }
    shell.appendChild(
      headEl({
        back: () => {
          stopThreadPoll()
          discardVoice("reply")
          state.replyFiles = []
          state.replyUploadErr = ""
          go(state.issueFrom || "page")
        },
        title: it.title,
        sub: `${it.key} · ${it.statusLabel} · ${plabel(it.priority || "medium")}`,
      }),
    )

    const body = document.createElement("div")
    body.className = "body"

    const screenshotUrl = safeImageUrl(it.screenshotUrl)
    const recordingUrl = safeHttpUrl(it.recordingUrl)
    const issueAttachments = Array.isArray(it.attachments) ? it.attachments : []
    const sourceUrl = safeHttpUrl(it.sourceUrl)
    const snap = it.domSnapshot || {}
    const box = elementBox(snap)
    const ctx = it.context || {}

    // 1 · Evidence — what the reporter saw, with the exact element outlined.
    if (screenshotUrl || recordingUrl || issueAttachments.length) {
      const sec = document.createElement("section")
      sec.className = "iv-sec"
      sec.innerHTML = `<p class="iv-lbl">Evidence</p>${
        screenshotUrl
          ? `<div class="shotwrap" title="Click to enlarge"><img alt="Screenshot of the reported page" src="${escapeHtml(
              screenshotUrl,
            )}" />${box ? `<span class="hl" style="${boxStyle(box)}"></span>` : ""}</div>`
          : ""
      }${
        recordingUrl
          ? `<video class="iv-rec" controls preload="metadata" src="${escapeHtml(recordingUrl)}"></video>`
          : ""
      }`
      const wrap = sec.querySelector(".shotwrap")
      if (wrap) {
        wrap.addEventListener("click", () => openImageLightbox(screenshotUrl, box))
        wrap.querySelector("img").addEventListener("error", () => wrap.remove())
      }
      appendAttachments(sec, issueAttachments)
      body.appendChild(sec)
    }

    // 2 · Where & what — enough to reproduce without asking the reporter.
    const env = [describeUserAgent(ctx.browser), ctx.os, ctx.viewport]
      .filter(Boolean)
      .join(" · ")
    const facts = [
      sourceUrl
        ? [
            "Page",
            `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(
              sourceUrl,
            )}">${escapeHtml(trimUrl(sourceUrl))}</a>`,
          ]
        : null,
      snap.selector ? ["Element", `<code title="${escapeHtml(snap.selector)}">${escapeHtml(snap.selector)}</code>`] : null,
      snap.text ? ["Text", `“${escapeHtml(snap.text)}”`] : null,
      env
        ? ["Browser", `<span title="${escapeHtml(ctx.browser || "")}">${escapeHtml(env)}</span>`]
        : null,
      [
        "Reported",
        `${escapeHtml((it.reporter && it.reporter.name) || "Someone")} · ${escapeHtml(ago(it.createdAt))} ago`,
      ],
    ].filter(Boolean)
    const where = document.createElement("section")
    where.className = "iv-sec"
    where.innerHTML = `<p class="iv-lbl">Where &amp; what</p><dl class="facts">${facts
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join("")}</dl>`
    body.appendChild(where)

    // 3 · Diagnostics — console errors and failed requests from page load.
    const errs = Array.isArray(ctx.consoleErrors) ? ctx.consoleErrors : []
    const reqs = Array.isArray(ctx.failedRequests) ? ctx.failedRequests : []
    const repro = Array.isArray(ctx.steps) ? ctx.steps : []
    if (repro.length) {
      const filed = new Date(it.createdAt).getTime()
      const before = (at) => {
        const s = Math.round((filed - new Date(at).getTime()) / 1000)
        if (!Number.isFinite(s) || s < 0) return ""
        return s < 60 ? `${s}s before` : `${Math.round(s / 60)}m before`
      }
      const sec = document.createElement("section")
      sec.className = "iv-sec"
      sec.innerHTML = `<p class="iv-lbl">Steps before report</p><ol class="steps">${repro
        .map((st) => {
          const what =
            st.kind === "nav"
              ? `Went to <code>${escapeHtml(st.url || "")}</code>`
              : `Clicked ${st.text ? `“${escapeHtml(st.text)}” ` : ""}<code>${escapeHtml(st.target || "")}</code>`
          return `<li><span>${what}</span><span class="when">${escapeHtml(before(st.at))}</span></li>`
        })
        .join("")}</ol>`
      body.appendChild(sec)
    }
    if (errs.length || reqs.length) {
      const diag = document.createElement("section")
      diag.className = "iv-sec"
      diag.innerHTML = `<p class="iv-lbl">Diagnostics</p><div class="ctxbox">${
        errs.length
          ? `<span class="ctxtitle">Console errors · ${errs.length}</span>${errs
              .map((l) => `<code class="errline">${escapeHtml(l)}</code>`)
              .join("")}`
          : ""
      }${
        reqs.length
          ? `<span class="ctxtitle">Failed requests · ${reqs.length}</span>${reqs
              .map((l) => `<code class="reqline">${escapeHtml(l)}</code>`)
              .join("")}`
          : ""
      }</div>`
      body.appendChild(diag)
    }

    // 4 · Triage
    const tri = document.createElement("section")
    tri.className = "iv-sec triage"
    tri.innerHTML = `<label>Status<select id="ie-status">${state.columns
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}"${c.id === it.status ? " selected" : ""}>${escapeHtml(c.label)}</option>`,
      )
      .join("")}</select></label><label>Priority<select id="ie-prio">${PRIORITIES.map(
      (p) => `<option value="${p}"${p === it.priority ? " selected" : ""}>${plabel(p)}</option>`,
    ).join("")}</select></label>`
    tri.querySelector("#ie-prio").addEventListener("change", (e) =>
      patchIssue({ priority: e.target.value }),
    )
    tri.querySelector("#ie-status").addEventListener("change", (e) =>
      patchIssue({ status: e.target.value }),
    )
    body.appendChild(tri)

    // 5 · Thread — description first, then comments.
    const thread = document.createElement("section")
    thread.className = "iv-sec"
    thread.innerHTML = `<p class="iv-lbl">Conversation</p>`
    const msgs = document.createElement("div")
    msgs.className = "msgs"
    const desc = plainText(it.description)
    if (desc) {
      msgs.appendChild(
        bubble({
          body: desc,
          author: it.reporter,
          createdAt: it.createdAt,
          me: state.me && it.reporter && it.reporter.name === state.me.name,
          // Report evidence is rendered once in the Evidence section above.
          // Repeating it in the opening message makes the thread noisy and
          // wastes the limited vertical space in the embedded panel.
          attachments: [],
        }),
      )
    }
    state.thread.forEach((c) =>
      msgs.appendChild(
        bubble({
          body: c.body,
          author: c.author,
          createdAt: c.createdAt,
          me: state.me && c.author && c.author.id === state.me.id,
          attachments: c.attachments,
        }),
      ),
    )
    if (!desc && !state.thread.length) {
      msgs.innerHTML = `<div class="sys">No comments yet — start the thread.</div>`
    }
    thread.appendChild(msgs)
    body.appendChild(thread)
    shell.appendChild(body)
    // Jump to the newest message only when the issue first opens or this
    // browser posts a reply. Background polling preserves the reader's place.
    if (state.scrollThreadToEnd) {
      state.scrollThreadToEnd = false
      requestAnimationFrame(() => {
        body.scrollTop = body.scrollHeight
      })
    }

    // Footer: message, file attachments and a short voice note.
    const foot = document.createElement("div")
    foot.className = "foot"
    const cp = document.createElement("form")
    cp.className = "compose"
    cp.innerHTML = `<div class="compose-staged"></div><div class="compose-row">
      <div class="compose-tools">
        <button type="button" class="att" id="ie-attach" title="Attach files" aria-label="Attach files">${I.clip}</button>
        <button type="button" class="att" id="ie-voice" title="Record voice note" aria-label="Record voice note">${I.mic}</button>
      </div>
      <textarea id="ie-reply" rows="1" placeholder="Write a reply…" autocomplete="off" aria-label="Reply"></textarea>
      <button class="send" type="submit" aria-label="Send" disabled>${I.send}</button>
    </div>`
    foot.appendChild(cp)
    const reply = cp.querySelector("#ie-reply")
    reply.addEventListener("input", () => {
      reply.style.height = "auto"
      reply.style.height = `${Math.min(reply.scrollHeight, 96)}px`
      renderReplyExtras(cp)
    })
    reply.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        cp.requestSubmit()
      }
    })
    cp.querySelector("#ie-attach").addEventListener("click", () => pickFiles("reply"))
    cp.querySelector("#ie-voice").addEventListener("click", () => {
      if (state.replyVoiceState === "recording") void stopVoice()
      else void startVoice("reply")
    })
    renderReplyExtras(cp)
    cp.addEventListener("submit", async (e) => {
      e.preventDefault()
      const inp = cp.querySelector("#ie-reply")
      const v = inp.value.trim()
      if (
        !v &&
        !state.replyFiles.length &&
        !state.replyVoice &&
        state.replyVoiceState !== "recording"
      ) {
        return
      }
      const send = cp.querySelector(".send")
      send.disabled = true
      try {
        if (state.replyVoiceState === "recording") await stopVoice()
        const c = await apiPost(`/widget/issues/${it.id}/comments`, {
          body: v,
          voice: state.replyVoice ? state.replyVoice.data : undefined,
          attachments: state.replyFiles.map((file) => ({
            name: file.name,
            data: file.data,
          })),
        })
        state.thread.push(c)
        state.replyFiles = []
        state.replyVoice = null
        state.replyVoiceState = "idle"
        state.replyVoiceErr = ""
        state.replyUploadErr = ""
        state.scrollThreadToEnd = true
        render()
      } catch (err) {
        console.error("[tesuto]", err)
        state.replyUploadErr =
          err && err.message ? err.message : "Couldn't send that reply. Try again."
        send.disabled = false
        renderReplyExtras(cp)
      }
    })
    shell.appendChild(foot)
  }

  async function patchIssue(patch) {
    try {
      const r = await apiPatch(`/widget/issues/${state.issue.id}`, patch)
      Object.assign(state.issue, r)
      state.issue.statusLabel =
        (state.columns.find((c) => c.id === state.issue.status) || {}).label ||
        state.issue.statusLabel
      await loadIssues()
      render()
    } catch (err) {
      console.error("[tesuto]", err)
    }
  }

  function bubble({ body, author, createdAt, me, attachments }) {
    const d = document.createElement("div")
    d.className = "msg" + (me ? " me" : "")
    d.innerHTML = `<span class="bub"><span class="msg-copy">${escapeHtml(body)}</span></span>
      <span class="by">${
        author
          ? `<span class="av" style="background:${safeColor(author.color)}">${escapeHtml(
              initials(author.name),
            )}</span>${escapeHtml(author.name)} · `
          : ""
      }${ago(createdAt)}</span>`
    appendAttachments(d.querySelector(".bub"), attachments)
    return d
  }

  /* ------------------------- pick / pin / compose --------------------- */
  let hoverEl = null
  // Screen-recording handles (kept outside `state`: render() never needs them).
  let recorder = null
  let recStream = null
  let recChunks = []
  let recTimer = null
  let recStartedAt = 0
  let recResolve = null
  let voiceRecorder = null
  let voiceStream = null
  let voiceChunks = []
  let voiceTimer = null
  let voiceStartedAt = 0
  let voiceTarget = null
  let voiceResolve = null
  let discardVoiceOnStop = false

  function targetState(target, field) {
    const prefix = target === "report" ? "report" : "reply"
    return `${prefix}${field}`
  }
  function voiceSupported() {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.MediaRecorder
    )
  }
  function voiceMime() {
    const options = [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/webm",
    ]
    return options.find((type) => MediaRecorder.isTypeSupported(type)) || ""
  }
  function refreshCaptureUi(target) {
    if (target === "report") renderReportExtras()
    else renderReplyExtras(shell.querySelector(".compose"))
  }
  function clearVoiceRecorder() {
    if (voiceTimer) clearInterval(voiceTimer)
    voiceTimer = null
    if (voiceStream) voiceStream.getTracks().forEach((track) => track.stop())
    voiceStream = null
    voiceRecorder = null
    voiceChunks = []
    voiceTarget = null
  }
  function resolveVoiceStop() {
    if (voiceResolve) voiceResolve()
    voiceResolve = null
  }
  function discardVoice(target) {
    if (voiceTarget === target && voiceRecorder && voiceRecorder.state !== "inactive") {
      discardVoiceOnStop = true
      voiceRecorder.stop()
    } else if (voiceTarget === target) {
      clearVoiceRecorder()
    }
    state[targetState(target, "Voice")] = null
    state[targetState(target, "VoiceState")] = "idle"
    state[targetState(target, "VoiceErr")] = ""
    refreshCaptureUi(target)
  }
  async function startVoice(target) {
    const stateKey = targetState(target, "VoiceState")
    const errorKey = targetState(target, "VoiceErr")
    if (!voiceSupported()) {
      state[stateKey] = "error"
      state[errorKey] = "Voice recording isn't supported in this browser."
      refreshCaptureUi(target)
      return
    }
    if (voiceRecorder && voiceRecorder.state !== "inactive") {
      await stopVoice()
    }
    state[targetState(target, "Voice")] = null
    state[stateKey] = "starting"
    state[errorKey] = ""
    refreshCaptureUi(target)
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      voiceTarget = target
      voiceChunks = []
      const mimeType = voiceMime()
      voiceRecorder = mimeType
        ? new MediaRecorder(voiceStream, { mimeType })
        : new MediaRecorder(voiceStream)
      voiceRecorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size) voiceChunks.push(event.data)
      })
      voiceRecorder.addEventListener("stop", () => {
        const finishedTarget = voiceTarget || target
        if (discardVoiceOnStop) {
          discardVoiceOnStop = false
          clearVoiceRecorder()
          refreshCaptureUi(finishedTarget)
          resolveVoiceStop()
          return
        }
        const type = (voiceRecorder && voiceRecorder.mimeType) || "audio/webm"
        const blob = new Blob(voiceChunks, { type })
        if (!blob.size || blob.size > VOICE_MAX_BYTES) {
          state[targetState(finishedTarget, "Voice")] = null
          state[targetState(finishedTarget, "VoiceState")] = "error"
          state[targetState(finishedTarget, "VoiceErr")] = blob.size
            ? "Voice note is over 8 MB. Record a shorter note."
            : "No audio was captured. Check microphone access and try again."
          clearVoiceRecorder()
          refreshCaptureUi(finishedTarget)
          resolveVoiceStop()
          return
        }
        const reader = new FileReader()
        reader.addEventListener("load", () => {
          state[targetState(finishedTarget, "Voice")] = {
            data: String(reader.result || ""),
            size: blob.size,
          }
          state[targetState(finishedTarget, "VoiceState")] = "idle"
          clearVoiceRecorder()
          refreshCaptureUi(finishedTarget)
          resolveVoiceStop()
        })
        reader.addEventListener("error", () => {
          state[targetState(finishedTarget, "VoiceState")] = "error"
          state[targetState(finishedTarget, "VoiceErr")] = "Couldn't prepare that voice note."
          clearVoiceRecorder()
          refreshCaptureUi(finishedTarget)
          resolveVoiceStop()
        })
        reader.readAsDataURL(blob)
      })
      voiceRecorder.start(250)
      voiceStartedAt = Date.now()
      state[stateKey] = "recording"
      refreshCaptureUi(target)
      voiceTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - voiceStartedAt) / 1000)
        const timer = shell.querySelector(
          target === "report" ? "#cp-voice-time" : "#ie-voice-time",
        )
        if (timer) timer.textContent = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
        if (elapsed >= VOICE_MAX_S) void stopVoice()
      }, 250)
    } catch (error) {
      clearVoiceRecorder()
      state[stateKey] = "error"
      state[errorKey] =
        error && error.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it and try again."
          : "Couldn't start the microphone."
      refreshCaptureUi(target)
    }
  }
  async function stopVoice() {
    if (!voiceRecorder || voiceRecorder.state === "inactive") return
    if (voiceTimer) clearInterval(voiceTimer)
    voiceTimer = null
    await new Promise((resolve) => {
      voiceResolve = resolve
      voiceRecorder.stop()
    })
  }
  function pickFiles(target) {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.accept = FILE_ACCEPT.join(",")
    input.addEventListener("change", async () => {
      const filesKey = targetState(target, "Files")
      const errorKey = targetState(target, "UploadErr")
      const existing = state[filesKey]
      const picked = Array.from(input.files || [])
      state[errorKey] = ""
      if (existing.length + picked.length > FILE_MAX_COUNT) {
        state[errorKey] = `Attach up to ${FILE_MAX_COUNT} files.`
        refreshCaptureUi(target)
        return
      }
      const readable = []
      for (const file of picked) {
        if (!FILE_ACCEPT.includes(file.type)) {
          state[errorKey] = `${file.name} isn't a supported file type.`
          continue
        }
        if (!file.size || file.size > FILE_MAX_BYTES) {
          state[errorKey] = `${file.name} is over 5 MB.`
          continue
        }
        readable.push(file)
      }
      const files = await Promise.all(
        readable.map(async (file) => {
          try {
            return {
              name: file.name.slice(0, 120),
              type: file.type,
              size: file.size,
              data: await fileToDataUrl(file),
            }
          } catch {
            state[errorKey] = `Couldn't read ${file.name}.`
            return null
          }
        }),
      )
      existing.push(...files.filter(Boolean))
      refreshCaptureUi(target)
    })
    input.click()
  }
  const pkOverlay = document.createElement("div")
  pkOverlay.className = "pk-overlay"
  pkOverlay.style.display = "none"
  const pkTag = document.createElement("div")
  pkTag.className = "pk-tag"
  const pkTagDot = document.createElement("span")
  pkTagDot.className = "pk-dot"
  const pkTagName = document.createElement("span")
  const pkTagDim = document.createElement("span")
  pkTagDim.className = "pk-dim"
  pkTag.append(pkTagDot, pkTagName, pkTagDim)
  pkOverlay.appendChild(pkTag)
  root.appendChild(pkOverlay)
  // Reticle stays one brand color; the picked element's kind reads from the
  // border PATTERN instead — solid (interactive), dashed (text), dotted
  // (structure) — so it says what's under it without turning into a rainbow.
  function pickCategory(el) {
    const tag = el.tagName.toLowerCase()
    if (/^(button|a|input|select|textarea|summary|option)$/.test(tag))
      return "interactive"
    const role = el.getAttribute && el.getAttribute("role")
    if (role === "button" || role === "link") return "interactive"
    try {
      if (getComputedStyle(el).cursor === "pointer") return "interactive"
    } catch {}
    if (
      /^(h1|h2|h3|h4|h5|h6|p|span|label|li|td|th|strong|em|small|blockquote)$/.test(
        tag,
      )
    )
      return "text"
    return "structure"
  }
  let pkHint = null
  let pinMark = null
  let cursorStyle = null

  function setCrosshair(on) {
    try {
      if (on && !cursorStyle) {
        cursorStyle = document.createElement("style")
        cursorStyle.textContent = "*{cursor:crosshair!important}"
        ;(document.head || document.documentElement).appendChild(cursorStyle)
      } else if (!on && cursorStyle) {
        cursorStyle.remove()
        cursorStyle = null
      }
    } catch {}
  }
  function clearPinMark() {
    if (pinMark) {
      pinMark.remove()
      pinMark = null
    }
  }
  function showPinMark(x, y) {
    clearPinMark()
    pinMark = document.createElement("div")
    pinMark.className = "pin-mark"
    pinMark.innerHTML = I.pinFill
    pinMark.style.left = x + "px"
    pinMark.style.top = y + "px"
    root.appendChild(pinMark)
    makePinDraggable(pinMark)
  }
  // Move the dropped pin (and keep state.picked / the compose caption in sync).
  function setPinAt(x, y) {
    x = Math.max(2, Math.min(innerWidth - 2, x))
    y = Math.max(2, Math.min(innerHeight - 2, y))
    if (pinMark) {
      pinMark.style.left = x + "px"
      pinMark.style.top = y + "px"
    }
    if (state.picked && state.picked.pin) {
      state.picked.pin = { x: x / innerWidth, y: y / innerHeight }
      state.picked.view = {
        x: x - 13,
        y: y - 26,
        w: 26,
        h: 26,
        vw: innerWidth,
        vh: innerHeight,
      }
      const sel = shell.querySelector(".sel")
      if (sel) {
        sel.textContent = `pin · ${(state.picked.pin.x * 100) | 0}% , ${
          (state.picked.pin.y * 100) | 0
        }%  ·  drag to adjust`
      }
    }
  }
  function makePinDraggable(el) {
    el.style.pointerEvents = "auto"
    el.style.cursor = "grab"
    let dragging = false
    el.addEventListener("pointerdown", (e) => {
      dragging = true
      el.style.cursor = "grabbing"
      try {
        el.setPointerCapture(e.pointerId)
      } catch {}
      e.preventDefault()
    })
    el.addEventListener("pointermove", (e) => {
      if (dragging) setPinAt(e.clientX, e.clientY)
    })
    const end = (e) => {
      dragging = false
      el.style.cursor = "grab"
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {}
    }
    el.addEventListener("pointerup", end)
    el.addEventListener("pointercancel", end)
  }

  function inWidget(el) {
    return el === host || host.contains(el)
  }
  function showHint(text) {
    if (!pkHint) {
      pkHint = document.createElement("div")
      pkHint.className = "pk-hint"
      root.appendChild(pkHint)
    }
    pkHint.textContent = text
    pkHint.style.display = "block"
  }
  function hideHint() {
    if (pkHint) pkHint.style.display = "none"
  }

  function openImageLightbox(src, box) {
    const overlay = document.createElement("div")
    overlay.className = "img-lightbox"
    const frame = document.createElement("div")
    frame.className = "lb-frame"
    const img = document.createElement("img")
    img.src = src
    img.alt = "Screenshot"
    frame.appendChild(img)
    if (box) {
      const hl = document.createElement("span")
      hl.className = "hl"
      hl.setAttribute("style", boxStyle(box))
      frame.appendChild(hl)
    }
    const close = document.createElement("button")
    close.type = "button"
    close.className = "close"
    close.setAttribute("aria-label", "Close")
    close.innerHTML = I.x
    overlay.append(frame, close)
    function dismiss() {
      overlay.remove()
      document.removeEventListener("keydown", onKey)
    }
    function onKey(e) {
      if (e.key === "Escape") dismiss()
    }
    overlay.addEventListener("click", dismiss)
    frame.addEventListener("click", (e) => e.stopPropagation())
    close.addEventListener("click", dismiss)
    document.addEventListener("keydown", onKey)
    root.appendChild(overlay)
  }

  function startPick() {
    state.view = "pick"
    panel.style.display = "none"
    fab.style.display = "none"
    clearPinMark()
    setCrosshair(true)
    showHint("Click an element  ·  ↑ parent  ·  Esc cancel")
    document.addEventListener("mousemove", onPickMove, true)
    document.addEventListener("keydown", onPickKey, true)
    document.addEventListener("click", onPickClick, true)
  }
  function startPin() {
    state.view = "pin"
    panel.style.display = "none"
    fab.style.display = "none"
    clearPinMark()
    setCrosshair(true)
    showHint("Click anywhere to drop a pin  ·  Esc cancel")
    document.addEventListener("click", onPinClick, true)
    document.addEventListener("keydown", onPickKey, true)
  }
  function stopPick() {
    pkOverlay.style.display = "none"
    hideHint()
    setCrosshair(false)
    hoverEl = null
    document.removeEventListener("mousemove", onPickMove, true)
    document.removeEventListener("keydown", onPickKey, true)
    document.removeEventListener("click", onPickClick, true)
    document.removeEventListener("click", onPinClick, true)
  }
  function onPickMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el || inWidget(el)) {
      pkOverlay.style.display = "none"
      hoverEl = null
      return
    }
    hoverEl = el
    paint(el)
  }
  function paint(el) {
    const r = el.getBoundingClientRect()
    const kind = pickCategory(el)
    pkOverlay.style.display = "block"
    pkOverlay.dataset.kind = kind
    pkOverlay.style.top = r.top + "px"
    pkOverlay.style.left = r.left + "px"
    pkOverlay.style.width = r.width + "px"
    pkOverlay.style.height = r.height + "px"
    // Keep the tag inside the box near the top edge — not above it — when
    // the element sits too close to the viewport top for the label to fit.
    pkTag.style.top = r.top > 28 ? "-24px" : "4px"
    pkTagDot.dataset.kind = kind
    pkTagName.textContent = selectorFor(el)
    pkTagDim.textContent = `${Math.round(r.width)}×${Math.round(r.height)}`
  }
  function onPickKey(e) {
    if (e.key === "Escape") {
      stopPick()
      go("actions")
    }
    if (e.key === "ArrowUp" && hoverEl && hoverEl.parentElement) {
      e.preventDefault()
      hoverEl = hoverEl.parentElement
      paint(hoverEl)
    }
  }
  function onPickClick(e) {
    const el = hoverEl || document.elementFromPoint(e.clientX, e.clientY)
    if (!el || inWidget(el)) return
    e.preventDefault()
    e.stopPropagation()
    const r = el.getBoundingClientRect()
    state.picked = {
      selector: selectorFor(el),
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
      rect: { width: Math.round(r.width), height: Math.round(r.height) },
      view: {
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
        vw: innerWidth,
        vh: innerHeight,
      },
    }
    stopPick()
    openCompose()
  }
  function onPinClick(e) {
    if (inWidget(document.elementFromPoint(e.clientX, e.clientY))) return
    e.preventDefault()
    e.stopPropagation()
    const cx = e.clientX
    const cy = e.clientY
    state.picked = {
      pin: { x: cx / innerWidth, y: cy / innerHeight },
      view: { x: cx - 13, y: cy - 26, w: 26, h: 26, vw: innerWidth, vh: innerHeight },
    }
    stopPick()
    showPinMark(cx, cy) // leave a marker on the page while they write the comment
    openCompose()
  }

  function openCompose() {
    state.shot = null
    state.shotState = "capturing"
    state.lastShotErr = ""
    state.rec = null
    state.recState = "idle"
    state.recErr = ""
    void stopRecording()
    go("compose")
    // the pick/pin click is a user gesture — grab the screenshot right away
    void grabShot({ auto: true })
  }

  async function grabShot(opts) {
    state.shotState = "capturing"
    renderShot()
    try {
      state.shot = await captureScreenshot(state.picked)
      state.shotState = state.shot ? "idle" : "error"
    } catch (err) {
      state.shot = null
      state.shotState = "error"
      state.lastShotErr =
        err && err.message === "unsupported"
          ? "unsupported"
          : (err && (err.name || err.message)) || "failed"
      if (!(opts && opts.auto)) console.error("[tesuto] screenshot", err)
    }
    renderShot()
  }

  function renderShot() {
    const wrap = shell.querySelector("#cp-shot")
    if (!wrap) return
    if (state.shotState === "capturing") {
      wrap.innerHTML = `<div class="shot-status">📷 Capturing — allow the share prompt…</div>`
      return
    }
    if (state.shot) {
      wrap.innerHTML = `<img class="shot-img" alt="Screenshot preview" src="${escapeHtml(state.shot)}" /><button type="button" class="linkbtn" id="cp-shot-x">Remove screenshot</button>`
      wrap.querySelector("#cp-shot-x").addEventListener("click", () => {
        state.shot = null
        state.shotState = "idle"
        renderShot()
      })
      return
    }
    // Screenshots are automatic on pick/pin — no "add" button. If the auto grab
    // failed (prompt denied etc.) offer a quiet retry unless it's unsupported.
    if (state.shotState === "error" && state.lastShotErr === "unsupported") {
      wrap.innerHTML = `<div class="note">This browser can't capture a screenshot here.</div>`
      return
    }
    if (state.shotState === "error") {
      wrap.innerHTML = `<div class="note">No screenshot attached. <button type="button" class="linkbtn" id="cp-shot-retry">Retry</button></div>`
      wrap
        .querySelector("#cp-shot-retry")
        .addEventListener("click", () => grabShot({}))
      return
    }
    wrap.innerHTML = ""
  }

  /* ------------------------- screen recording ------------------------ */
  function recSupported() {
    const md = navigator.mediaDevices
    return (
      !!md &&
      typeof md.getDisplayMedia === "function" &&
      typeof MediaRecorder === "function"
    )
  }
  function pickMime() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported)
      return ""
    const cands = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ]
    for (let i = 0; i < cands.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(cands[i])) return cands[i]
      } catch {}
    }
    return ""
  }
  function fmtDur(ms) {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  }
  function cleanupRec() {
    if (recTimer) {
      clearInterval(recTimer)
      recTimer = null
    }
    if (recStream) {
      try {
        recStream.getTracks().forEach((t) => t.stop())
      } catch {}
      recStream = null
    }
    recorder = null
    recChunks = []
  }
  function resolveRec(v) {
    const r = recResolve
    recResolve = null
    if (r) r(v)
  }
  function finishRecording() {
    const chunks = recChunks.slice()
    const mime = (recorder && recorder.mimeType) || "video/webm"
    cleanupRec()
    let blob = null
    try {
      blob = new Blob(chunks, { type: mime })
    } catch {}
    if (!blob || !blob.size) {
      state.recState = "idle"
      renderRec()
      resolveRec(state.rec)
      return
    }
    if (blob.size > REC_MAX_BYTES) {
      state.rec = null
      state.recState = "error"
      state.recErr = "too-large"
      renderRec()
      resolveRec(null)
      return
    }
    try {
      const fr = new FileReader()
      fr.onload = () => {
        state.rec = String((fr.result || ""))
        state.recState = state.rec ? "idle" : "error"
        if (!state.rec) state.recErr = "failed"
        renderRec()
        resolveRec(state.rec)
      }
      fr.onerror = () => {
        state.recState = "error"
        state.recErr = "failed"
        renderRec()
        resolveRec(null)
      }
      fr.readAsDataURL(blob)
    } catch {
      state.recState = "error"
      state.recErr = "failed"
      renderRec()
      resolveRec(null)
    }
  }
  async function startRecording() {
    if (!recSupported()) {
      state.recState = "error"
      state.recErr = "unsupported"
      renderRec()
      return
    }
    state.rec = null
    state.recState = "starting"
    state.recErr = ""
    renderRec()
    const md = navigator.mediaDevices
    let stream = null
    try {
      stream = await md.getDisplayMedia({ video: true, audio: false })
    } catch (err) {
      state.recState = "idle"
      // Denied the picker → stay quiet; anything else is a real error.
      if (
        !err ||
        (err.name !== "NotAllowedError" && err.name !== "AbortError")
      ) {
        state.recState = "error"
        state.recErr = (err && (err.name || err.message)) || "failed"
      }
      renderRec()
      return
    }
    const mime = pickMime()
    let rec = null
    try {
      rec =
        mime.length > 0
          ? new MediaRecorder(stream, {
              mimeType: mime,
              videoBitsPerSecond: 1500000,
            })
          : new MediaRecorder(stream)
    } catch (err) {
      try {
        stream.getTracks().forEach((t) => t.stop())
      } catch {}
      state.recState = "error"
      state.recErr = (err && (err.name || err.message)) || "failed"
      renderRec()
      return
    }
    recChunks = []
    recStream = stream
    recorder = rec
    recStartedAt = Date.now()
    rec.ondataavailable = (e) => {
      if (e && e.data && e.data.size) recChunks.push(e.data)
    }
    rec.onstop = () => finishRecording()
    const track = stream.getVideoTracks()[0]
    if (track) {
      // User hit "Stop sharing" in the browser chrome.
      track.onended = () => {
        void stopRecording().then(() => renderRec())
      }
    }
    try {
      rec.start(500)
    } catch (err) {
      cleanupRec()
      state.recState = "error"
      state.recErr = (err && (err.name || err.message)) || "failed"
      renderRec()
      return
    }
    state.recState = "recording"
    renderRec()
    recTimer = setInterval(() => {
      const el = shell.querySelector("#cp-rec-timer")
      if (el) el.textContent = fmtDur(Date.now() - recStartedAt)
      if (Date.now() - recStartedAt >= REC_MAX_S * 1000) {
        void stopRecording().then(() => renderRec())
      }
    }, 500)
  }
  // Stops an in-flight capture; resolves with the finished clip (or null).
  function stopRecording() {
    return new Promise((resolve) => {
      if (!recorder || state.recState !== "recording") {
        cleanupRec()
        resolve(state.rec)
        return
      }
      recResolve = resolve
      try {
        recorder.stop()
      } catch {
        const kept = state.rec
        cleanupRec()
        resolve(kept)
      }
    })
  }
  function renderRec() {
    const wrap = shell.querySelector("#cp-rec")
    if (!wrap) return
    if (!recSupported()) {
      wrap.innerHTML = `<div class="note">Screen recording isn't available in this browser.</div>`
      return
    }
    if (state.recState === "starting") {
      wrap.innerHTML = `<div class="shot-status">🎬 Starting — allow the share prompt…</div>`
      return
    }
    if (state.recState === "recording") {
      wrap.innerHTML = `<div class="shot-status">🔴 Recording <span id="cp-rec-timer">0:00</span> · up to 1:00<br><button type="button" class="linkbtn" id="cp-rec-stop">Stop recording</button></div>`
      wrap
        .querySelector("#cp-rec-stop")
        .addEventListener("click", () =>
          stopRecording().then(() => renderRec()),
        )
      return
    }
    if (state.rec) {
      wrap.innerHTML = `<video class="shot-img" id="cp-rec-vid" controls playsinline></video><button type="button" class="linkbtn" id="cp-rec-x">Remove recording</button>`
      wrap.querySelector("#cp-rec-vid").src = state.rec
      wrap.querySelector("#cp-rec-x").addEventListener("click", () => {
        state.rec = null
        state.recState = "idle"
        renderRec()
      })
      return
    }
    if (state.recState === "error") {
      if (state.recErr === "too-large") {
        wrap.innerHTML = `<div class="note">That clip is over 10 MB — discarded. <button type="button" class="linkbtn" id="cp-rec-retry">Record a shorter one</button></div>`
      } else {
        wrap.innerHTML = `<div class="note">Couldn't record. <button type="button" class="linkbtn" id="cp-rec-retry">Retry</button></div>`
      }
      wrap
        .querySelector("#cp-rec-retry")
        .addEventListener("click", () => startRecording())
      return
    }
    wrap.innerHTML = `<button type="button" class="linkbtn" id="cp-rec-start">● Record screen (up to 1 min)</button>`
    wrap
      .querySelector("#cp-rec-start")
      .addEventListener("click", () => startRecording())
  }

  /* ----------------- direct record flow (no element) ----------------- */
  async function startDirectRecording() {
    state.rec = null
    state.recState = "idle"
    state.recErr = ""
    state.view = "recording"
    render()
    await startRecording()
    if (state.view !== "recording") return
    if (state.recState === "recording" || state.recState === "error") {
      render()
    } else {
      // Share picker denied → back out quietly.
      go("actions")
    }
  }
  function renderRecording() {
    shell.appendChild(
      headEl({
        back: () => {
          void stopRecording().then(() => {
            state.rec = null
            state.recState = "idle"
          })
          go("actions")
        },
        title: "Record video",
        sub: "Capture your screen — no element needed",
      }),
    )
    const body = document.createElement("div")
    body.className = "body"
    if (!recSupported()) {
      body.innerHTML = `<div class="empty">Screen recording isn't available in this browser.</div>`
    } else if (state.recState === "recording") {
      body.innerHTML = `<div class="empty"><div style="font-size:30px;line-height:1">🔴</div>
        <div id="cp-rec-timer" style="font-size:26px;font-weight:700;color:var(--text)">0:00</div>
        <p style="margin:6px 0 14px">Capturing — narrate the bug, then stop.</p>
        <button type="button" class="btn primary" id="rc-stop">Stop &amp; continue</button></div>`
      body.querySelector("#rc-stop").addEventListener("click", async () => {
        const btn = body.querySelector("#rc-stop")
        btn.disabled = true
        btn.textContent = "Finishing…"
        await stopRecording()
        if (state.rec) {
          state.picked = null
          go("compose")
        } else {
          render()
        }
      })
    } else if (state.recState === "error") {
      body.innerHTML = `<div class="empty">${
        state.recErr === "too-large"
          ? "That clip is over 10 MB — discarded."
          : "Couldn't record."
      }<br><button type="button" class="linkbtn" id="rc-back">Back to actions</button></div>`
      body
        .querySelector("#rc-back")
        .addEventListener("click", () => go("actions"))
    } else {
      body.innerHTML = `<div class="empty">Starting — allow the share prompt…</div>`
    }
    shell.appendChild(body)
  }

  // Same rule as the dashboard's likelyDuplicates(): structural selectors
  // only match with identical element text; stable ones match on their own.
  function sameElementIssues(p) {
    if (!p || !p.selector) return []
    const stable = /^[#[]/.test(p.selector)
    return (state.issues.page || [])
      .filter(
        (it) =>
          it.open &&
          it.selector === p.selector &&
          (stable || (!!p.text && it.elementText === p.text)),
      )
      .slice(0, 3)
  }

  function renderCompose() {
    const p = state.picked || {}
    const isPin = !!p.pin
    const dupes = isPin ? [] : sameElementIssues(p)
    shell.appendChild(
      headEl({
        back: () => {
          state.picked = null
          void stopRecording().then(() => {
            state.rec = null
            state.recState = "idle"
          })
          discardVoice("report")
          state.reportFiles = []
          clearPinMark()
          go("actions")
        },
        title: isPin ? "New pin comment" : "Comment on element",
      }),
    )
    const form = document.createElement("form")
    form.className = "form scroll"
    form.innerHTML = `
      ${
        isPin
          ? `<div class="sel">pin · ${(p.pin.x * 100) | 0}% , ${(p.pin.y * 100) | 0}%  ·  drag to adjust</div>`
          : p.selector
            ? `<div class="sel">${escapeHtml(p.selector)}</div>`
            : `<div class="sel">Video report — no element picked</div>`
      }
      ${
        dupes.length
          ? `<div class="dupe"><b>Already reported on this element</b>${dupes
              .map(
                (d) =>
                  `<button type="button" class="linkbtn" data-dupe="${escapeHtml(d.id)}">${escapeHtml(
                    d.key,
                  )} · ${escapeHtml(d.title)}</button>`,
              )
              .join("")}<span>Open it to add to the thread instead of filing a new one.</span></div>`
          : ""
      }
      <label>What's the comment?</label>
      <input id="cp-title" placeholder="Short summary" />
      <label>Details</label>
      <textarea id="cp-desc" placeholder="What did you expect / what happened?"></textarea>
      <label>Priority</label>
      <select id="cp-prio">${PRIORITIES.map(
        (x) => `<option value="${x}"${x === "medium" ? " selected" : ""}>${plabel(x)}</option>`,
      ).join("")}</select>
      <label>Screenshot</label>
      <div id="cp-shot"></div>
      <label>Screen recording <span style="font-weight:400">(optional)</span></label>
      <div id="cp-rec"></div>
      <label>Files &amp; voice <span style="font-weight:400">(optional)</span></label>
      <div id="cp-extra"></div>
      <div class="note">${
        consoleErrors.length + failedRequests.length
      } page signal(s) and ${steps.length} recent step(s) will be attached.</div>
      <div class="btnrow stick">
        <button class="btn ghost" type="button" id="cp-cancel">Cancel</button>
        <button class="btn primary" type="submit" id="cp-send">Post comment</button>
      </div>`
    shell.appendChild(form)
    renderShot()
    renderRec()
    renderReportExtras()
    form.querySelector("#cp-title").focus()
    form.querySelectorAll("[data-dupe]").forEach((b) =>
      b.addEventListener("click", () => {
        state.picked = null
        clearPinMark()
        void openIssue(b.getAttribute("data-dupe"))
      }),
    )
    form.querySelector("#cp-cancel").addEventListener("click", () => {
      state.picked = null
      void stopRecording().then(() => {
        state.rec = null
        state.recState = "idle"
      })
      discardVoice("report")
      state.reportFiles = []
      clearPinMark()
      go("actions")
    })
    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      const btn = form.querySelector("#cp-send")
      const title = form.querySelector("#cp-title").value.trim()
      btn.disabled = true
      btn.textContent = "Posting…"
      try {
        // A capture in flight → finish it first so the clip ships with the report.
        if (state.recState === "recording") {
          btn.textContent = "Finishing recording…"
          await stopRecording()
        }
        if (state.reportVoiceState === "recording") {
          btn.textContent = "Finishing voice note…"
          await stopVoice()
        }
        const dom = isPin
          ? { selector: "", tag: "", x: p.pin.x, y: p.pin.y }
          : {
              selector: p.selector || "",
              tag: p.tag || "",
              text: p.text || undefined,
              rect: p.rect,
              view: p.view,
            }
        await apiPost("/widget/issues", {
          title:
            title ||
            (isPin ? "Pin comment" : p.selector ? `Issue on ${p.selector}` : "Video report"),
          description: form.querySelector("#cp-desc").value.trim() || undefined,
          priority: form.querySelector("#cp-prio").value,
          sourceUrl: location.href,
          screenshot: state.shot || undefined,
          recording: state.rec || undefined,
          voice: state.reportVoice ? state.reportVoice.data : undefined,
          attachments: state.reportFiles.map((file) => ({
            name: file.name,
            data: file.data,
          })),
          domSnapshot: dom,
          context: {
            browser: navigator.userAgent,
            viewport: `${innerWidth}×${innerHeight}`,
            consoleErrors: consoleErrors.length ? consoleErrors.slice() : undefined,
            failedRequests: failedRequests.length ? failedRequests.slice() : undefined,
            steps: steps.length ? steps.slice() : undefined,
          },
        })
        state.picked = null
        state.shot = null
        state.rec = null
        state.recState = "idle"
        state.reportFiles = []
        state.reportVoice = null
        state.reportVoiceState = "idle"
        state.reportVoiceErr = ""
        state.reportUploadErr = ""
        clearPinMark()
        await loadIssues()
        go("page")
      } catch (err) {
        btn.disabled = false
        btn.textContent = "Post comment"
        console.error("[tesuto]", err)
        const note = form.querySelector(".note")
        // 4xx means the server told us what's wrong (rate limit, payload too
        // large, validation) — surface it; network/5xx stay generic.
        const why =
          err && err.status >= 400 && err.status < 500 && err.message
            ? `: ${err.message}`
            : ""
        note.textContent = `Couldn't post — please try again${why}.`
        note.classList.add("err")
      }
    })
  }

  /* -------------------------------- boot -------------------------------- */
  async function loadIssues() {
    // settle independently — a transient failure on one scope must not wipe the
    // other list (that's what made "All Issues" look empty / half-loaded)
    const [page, all] = await Promise.allSettled([
      apiGet(
        `/widget/issues?scope=page&url=${encodeURIComponent(location.href)}`,
      ),
      apiGet("/widget/issues?scope=all"),
    ])
    if (page.status === "fulfilled") state.issues.page = page.value
    else console.error("[tesuto] page issues", page.reason)
    if (all.status === "fulfilled") state.issues.all = all.value
    else console.error("[tesuto] all issues", all.reason)
  }

  async function boot() {
    try {
      const b = await apiGet("/widget/bootstrap")
      state.project = b.project
      state.me = b.user
      state.columns = b.columns
      await loadIssues()
    } catch (err) {
      if (String(err && err.message).includes("unauthorized")) return
      state.me = null
    }
  }

  ;(async () => {
    if (!TOKEN) {
      render() // → token prompt
      return
    }
    // validate the project token, then mint a session for the host's user
    try {
      state.project = await apiGet("/widget/project")
    } catch {
      state.badToken = true
      render()
      return
    }
    if (await authSilently()) await boot()
    render()
  })()

  /* --------------------------- global shortcut ------------------------- */
  document.addEventListener("keydown", (e) => {
    const want = { mod: e.metaKey || e.ctrlKey, shift: e.shiftKey, alt: e.altKey }
    const key = SHORTCUT[SHORTCUT.length - 1]
    const modsOk = SHORTCUT.slice(0, -1).every((m) => want[m])
    if (modsOk && e.key.toLowerCase() === key) {
      e.preventDefault()
      if (state.view === "collapsed") go("actions")
      else collapse()
    }
  })
})()
