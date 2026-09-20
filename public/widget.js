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
 * A side panel. Identity comes from the host app two ways: verified mode
 * takes a short-lived signed assertion minted by the host server (the widget
 * proves nothing itself — Tesuto verifies the signature), and an unknown
 * host user links a Tesuto account once via an emailed code, remembered
 * after that. Legacy dev mode takes a bare name/email claim. Either way the
 * Tesuto session is separate from the host session: the footer disconnects
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
  // The host app hands the widget its signed-in user, so there's no sign-in
  // screen. `{ name, email }` or nothing (→ shared "Widget" system user).
  const CFG_USER =
    cfg.user && cfg.user.name && cfg.user.email
      ? { name: String(cfg.user.name), email: String(cfg.user.email) }
      : null
  // Verified mode: the host passes a signed identity assertion minted by its
  // own server (HMAC, short expiry) instead of a bare name/email claim.
  // Tesuto proves the signature before trusting the identity — see
  // lib/assertion.ts. Unset = legacy trusted-host dev mode.
  const CFG_ASSERTION =
    (typeof cfg.assertion === "string" && cfg.assertion) ||
    attr("assertion") ||
    ""

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

  const TK_KEY = "tesuto:widget-token"
  const THEME_KEY = "tesuto:widget-theme"
  const ls = { get: lsGet, set: lsSet, del: lsDel }

  function prefersLight() {
    try {
      return window.matchMedia("(prefers-color-scheme: light)").matches
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
  let userToken = ls.get(TK_KEY)

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
        ls.del(TK_KEY)
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

  const PURPLE = "#7c5cff"
  root.innerHTML = `
<style>
  :host { all: initial }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif }
  .wrap { --bg:#0d0d10; --panel:#151519; --card:#1b1b21; --line:#26262e; --text:#f4f4f5;
    --muted:#a1a1aa; --purple:${PURPLE}; --purple-soft:rgba(124,92,255,.16);
    position: fixed; bottom: 20px; right: 20px; pointer-events: auto; color: var(--text) }
  .wrap[data-theme="light"] { --bg:#ffffff; --panel:#f7f7f8; --card:#ffffff; --line:#e4e4e7;
    --text:#18181b; --muted:#71717a }

  .fab { position: fixed; bottom: 20px; right: 20px; width: 52px; height: 52px; border-radius: 50%;
    border: 1px solid var(--line); background: var(--bg); color: var(--text); cursor: pointer;
    pointer-events: auto; display: grid; place-items: center; box-shadow: 0 10px 30px rgba(0,0,0,.35) }
  .fab svg { width: 20px; height: 20px }

  .panel { position: fixed; bottom: 20px; right: 20px; width: 400px; max-width: calc(100vw - 40px);
    height: 640px; max-height: calc(100vh - 40px); pointer-events: auto; display: flex; flex-direction: column;
    background: var(--bg); border: 1px solid var(--line); border-radius: 16px; overflow: hidden;
    box-shadow: 0 24px 60px rgba(0,0,0,.4) }

  .head { background: linear-gradient(160deg, #8b6dff, ${PURPLE}); color: #fff; padding: 18px 18px 14px }
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
  .tabs button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--purple) }
  .tabs svg { width: 14px; height: 14px }
  .tabs .count { background: var(--card); color: var(--muted); border: 1px solid var(--line);
    font-size: 11px; border-radius: 999px; padding: 0 6px; min-width: 18px; text-align: center }

  .body { flex: 1; overflow-y: auto; padding: 14px }

  .actioncard { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;
    padding: 16px; border-radius: 14px; border: 1px solid var(--line); background: var(--card);
    color: var(--text); cursor: pointer; margin-bottom: 12px }
  .actioncard.primary { background: var(--purple); border-color: transparent; color: #fff }
  .actioncard .ico { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
    background: var(--purple-soft); flex: none }
  .actioncard.primary .ico { background: rgba(255,255,255,.18) }
  .actioncard .ico svg { width: 20px; height: 20px }
  .actioncard h3 { margin: 0; font-size: 15px; font-weight: 700 }
  .actioncard.primary h3 { color: #fff }
  .actioncard:not(.primary) h3 { color: var(--purple) }
  .actioncard p { margin: 2px 0 0; font-size: 12.5px; color: var(--muted) }
  .actioncard.primary p { color: rgba(255,255,255,.8) }
  .actioncard .chev { margin-left: auto; color: currentColor; opacity: .6 }

  .issue { display: flex; gap: 10px; width: 100%; text-align: left; padding: 11px 10px; border: none;
    background: none; color: var(--text); cursor: pointer; border-radius: 10px }
  .issue:hover { background: var(--card) }
  .issue .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; background: var(--muted) }
  .issue .t { font-size: 13.5px; font-weight: 600; line-height: 1.35 }
  .issue .m { font-size: 11.5px; color: var(--muted); margin-top: 3px; display: flex; gap: 8px; flex-wrap: wrap }
  .issue .chev { margin-left: auto; color: var(--muted); align-self: center }
  .empty { color: var(--muted); font-size: 13px; text-align: center; padding: 28px 12px }

  .msgs { display: flex; flex-direction: column; gap: 14px }
  .msg .bub { display: inline-block; background: var(--card); border-radius: 12px; padding: 9px 12px;
    font-size: 13.5px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; max-width: 88% }
  .msg.me { align-items: flex-end }
  .msg.me .bub { background: var(--purple); color: #fff }
  .msg .by { font-size: 11.5px; color: var(--muted); margin-top: 5px; display: flex; align-items: center; gap: 6px }
  .msg .av { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
    font-size: 8px; font-weight: 700; color: #fff }
  .sys { color: var(--muted); font-size: 12px; text-align: center }

  .foot { border-top: 1px solid var(--line); background: var(--bg) }
  .metaedit { padding: 12px 14px 4px; display: flex; flex-direction: column; gap: 8px }
  .metaedit .r { display: flex; align-items: center; gap: 10px }
  .metaedit label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; color: var(--muted); width: 62px }
  .metaedit select { flex: 1; background: var(--card); color: var(--text); border: 1px solid var(--line);
    border-radius: 8px; padding: 7px 9px; font-size: 13px; font-family: inherit }
  .metaedit .shot { width: 52px; height: 38px; border-radius: 6px; border: 1px solid var(--line);
    object-fit: cover; background: var(--card); cursor: pointer; flex: none }
  .metaedit a, .metaedit code { flex: 1; min-width: 0; font-size: 12px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap }
  .metaedit a { color: var(--purple); text-decoration: none }
  .metaedit code { color: var(--muted); font-family: ui-monospace, SFMono-Regular, monospace }

  .compose { display: flex; align-items: center; gap: 8px; padding: 10px 12px }
  .compose .att { background: none; border: none; color: var(--muted); cursor: pointer; padding: 4px }
  .compose input { flex: 1; background: var(--card); color: var(--text); border: 1px solid var(--purple);
    border-radius: 9px; padding: 10px 12px; font-size: 13px; font-family: inherit; outline: none }
  .compose .send { width: 38px; height: 38px; border-radius: 9px; border: none; background: var(--purple);
    color: #fff; cursor: pointer; display: grid; place-items: center; flex: none }
  .compose .send svg { width: 16px; height: 16px }

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
  .btn.primary { background: var(--purple); color: #fff }
  .btn.ghost { background: transparent; border: 1px solid var(--line); color: var(--text) }
  .btn[disabled] { opacity: .55; cursor: default }
  .shot-status { margin-top: 3px; padding: 10px; border-radius: 8px; background: var(--card); color: var(--muted); font-size: 12px }
  .shot-img { display: block; width: 100%; border-radius: 8px; border: 1px solid var(--line); margin-top: 4px }
  .linkbtn { background: none; border: none; color: var(--purple); font-size: 11.5px; font-weight: 700; cursor: pointer; margin-top: 6px; padding: 0 }
  .note { font-size: 11px; color: var(--muted); margin-top: 10px }
  .err { color: #f87171 }

  /* page overlays for pick / pin */
  .pk-overlay { position: fixed; border: 2px solid ${PURPLE}; background: rgba(124,92,255,.12);
    pointer-events: none; border-radius: 4px; transition: all .04s linear; z-index: 2147483001 }
  .pk-tag { position: absolute; top: -22px; left: 0; background: ${PURPLE}; color: #fff;
    font: 500 11px/1 ui-monospace, monospace; padding: 3px 5px; border-radius: 3px; white-space: nowrap }
  .pk-hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #18181b; color: #fff;
    font-size: 12.5px; padding: 8px 14px; border-radius: 999px; pointer-events: none; z-index: 2147483002;
    box-shadow: 0 8px 24px rgba(0,0,0,.3) }
  .pin-mark { position: fixed; width: 28px; height: 28px; margin: -28px 0 0 -14px; z-index: 2147483001; pointer-events: none;
    color: ${PURPLE}; animation: pin-drop .18s cubic-bezier(.2,.8,.3,1) }
  .pin-mark svg { width: 28px; height: 28px; display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)) }
  @keyframes pin-drop { from { transform: translateY(-8px) scale(.7); opacity: 0 } to { transform: none; opacity: 1 } }
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
    chevU: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
    clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5 12.5 21a4 4 0 0 1-6-6l9-9a3 3 0 0 1 4 4l-9 9a2 2 0 0 1-3-3l8-8"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    rec: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>',
  }

  const PRIORITIES = ["urgent", "high", "medium", "low"]
  const plabel = (p) => p[0].toUpperCase() + p.slice(1)
  // Screen recordings: capped so a clip stays emailable-sized and Postgres-safe.
  const REC_MAX_S = 60
  const REC_MAX_BYTES = 10 * 1024 * 1024
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
    manualCreds: null, // legacy dev-mode sign-in form values { name, email }
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
    issues: { page: [], all: [] },
    issue: null,
    issueFrom: "page", // which tab openIssue() was called from
    thread: [],
    threadTimer: null,
  }

  const wrap = document.createElement("div")
  wrap.className = "wrap"
  wrap.dataset.theme = state.theme
  wrap.style.cssText = "position:static;pointer-events:none"
  root.appendChild(wrap)

  const fab = document.createElement("button")
  fab.className = "fab"
  fab.addEventListener("click", () => {
    if (state.view === "collapsed") go("actions")
    else collapse()
  })
  wrap.appendChild(fab)

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
    fab.style.display = open ? "none" : "grid"
    fab.innerHTML = I.chevU
    if (!open) return

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
      d.style.background = idColor
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
        "Disconnect this browser from Tesuto (Hearth stays signed in)"
      out.addEventListener("click", () => {
        void disconnect()
      })
      ub.appendChild(out)
      f.appendChild(ub)
    }
    return f
  }

  // Tesuto-only sign-out: kills the widget session, leaves the Hearth
  // session alone. No auto-reconnect until the user hits Connect again.
  async function disconnect() {
    state.manualDisconnect = true
    stopThreadPoll()
    try {
      await apiRaw("DELETE", "/widget/auth")
    } catch {}
    userToken = null
    ls.del(TK_KEY)
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
            ? `Hearth: <b style="color:var(--text)">${escapeHtml(hostEmail)}</b><br>`
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
    // Legacy dev mode: sign in as any claimed identity.
    const pre = state.manualCreds || CFG_USER || { name: "", email: "" }
    const form = document.createElement("form")
    form.className = "form"
    form.innerHTML = `
      <p class="note" style="margin-top:0">Sign in to Tesuto to file issues and comment. (Dev mode: any name + email works.)</p>
      <label>Name</label>
      <input id="si-name" autocomplete="name" placeholder="Your name" value="${escapeHtml(
        pre.name || "",
      )}" />
      <label>Email</label>
      <input id="si-email" type="email" autocomplete="email" placeholder="you@company.com" value="${escapeHtml(
        pre.email || "",
      )}" />
      <div class="btnrow"><button class="btn primary" type="submit" id="si-go">Sign in</button></div>`
    shell.appendChild(form)
    form.querySelector("#si-name").focus()
    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      const name = form.querySelector("#si-name").value.trim()
      const email = form.querySelector("#si-email").value.trim()
      if (!name || !email) return
      const btn = form.querySelector("#si-go")
      btn.disabled = true
      btn.textContent = "Signing in…"
      state.manualCreds = { name, email }
      state.manualDisconnect = false
      render()
      if (await authSilently()) {
        state.view = "actions"
        await boot()
      }
      render()
    })
  }

  /* ---------------------------- identity ------------------------------ */
  // Verified mode: the host proves its user with a signed assertion. A
  // remembered host→user link signs straight in as the linked Tesuto user;
  // otherwise auth answers `{ linked: false }` and the link flow must run
  // first — nobody files or comments on an unproven identity.
  // Legacy mode (no assertion configured): the host's name/email claim is
  // trusted as before. Local dev only.
  async function authSilently() {
    if (state.manualDisconnect) return false
    if (CFG_ASSERTION) {
      try {
        const r = await apiPost("/widget/auth", { assertion: CFG_ASSERTION })
        if (r && r.linked === false) {
          userToken = null
          ls.del(TK_KEY)
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
        ls.set(TK_KEY, r.token)
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
    const creds = state.manualCreds || CFG_USER
    if (!creds) {
      userToken = null
      ls.del(TK_KEY)
      state.noUser = true
      return false
    }
    try {
      const r = await apiPost("/widget/auth", {
        name: creds.name,
        email: creds.email,
      })
      userToken = r.token
      ls.set(TK_KEY, r.token)
      state.noUser = false
      saveIdentity(creds.email, r.user.name)
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
        sub: link.hostEmail ? `Hearth: ${link.hostEmail}` : "",
      }),
    )
    const form = document.createElement("form")
    form.className = "form"
    if (link.step === "email") {
      form.innerHTML = `
        <p class="note" style="margin-top:0">You're signed in to Hearth as <b style="color:var(--text)">${escapeHtml(
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
          ls.set(TK_KEY, r.token)
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
    c2.innerHTML = `<span class="ico">${I.pin}</span><span><h3>Pin anywhere</h3><p>Drop a pin at any point</p></span><span class="chev">${I.chevR}</span>`
    c2.addEventListener("click", startPin)
    body.appendChild(c2)

    const c3 = document.createElement("button")
    c3.className = "actioncard"
    c3.innerHTML = `<span class="ico">${I.rec}</span><span><h3>Record video</h3><p>Capture your screen, no element needed</p></span><span class="chev">${I.chevR}</span>`
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
    return col.terminal ? "#10b981" : status === "in_progress" ? "#f59e0b" : PURPLE
  }

  /* ---------------------------- issue detail --------------------------- */
  async function openIssue(id) {
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
          go(state.issueFrom || "page")
        },
        title: it.title,
        sub: `${it.key} · ${it.statusLabel}`,
        idColor: (it.reporter && it.reporter.color) || PURPLE,
      }),
    )

    const body = document.createElement("div")
    body.className = "body"
    const msgs = document.createElement("div")
    msgs.className = "msgs"
    if (it.description) {
      msgs.appendChild(bubble({ body: it.description, author: it.reporter, createdAt: it.createdAt, me: state.me && it.reporter && it.reporter.name === state.me.name }))
    }
    state.thread.forEach((c) =>
      msgs.appendChild(
        bubble({
          body: c.body,
          author: c.author,
          createdAt: c.createdAt,
          me: state.me && c.author && c.author.id === state.me.id,
        }),
      ),
    )
    if (!it.description && !state.thread.length) {
      msgs.innerHTML = `<div class="sys">No comments yet — start the thread.</div>`
    }
    body.appendChild(msgs)
    shell.appendChild(body)
    requestAnimationFrame(() => {
      body.scrollTop = body.scrollHeight
    })

    // footer: priority/status editors + screenshot thumb + reply
    const foot = document.createElement("div")
    foot.className = "foot"

    const me = document.createElement("div")
    me.className = "metaedit"
    me.innerHTML = `
      ${
        it.screenshotUrl
          ? `<div class="r"><label>Shot</label><img class="shot" alt="screenshot" src="${escapeHtml(
              it.screenshotUrl,
            )}" /></div>`
          : ""
      }
      ${
        it.sourceUrl
          ? `<div class="r"><label>Page</label><a href="${escapeHtml(
              it.sourceUrl,
            )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              trimUrl(it.sourceUrl),
            )}</a></div>`
          : ""
      }
      ${
        it.domSnapshot && it.domSnapshot.selector
          ? `<div class="r"><label>Element</label><code>${escapeHtml(
              it.domSnapshot.selector,
            )}</code></div>`
          : ""
      }
      <div class="r"><label>Priority</label>
        <select id="ie-prio">${PRIORITIES.map(
          (p) =>
            `<option value="${p}"${p === it.priority ? " selected" : ""}>${plabel(p)}</option>`,
        ).join("")}</select></div>
      <div class="r"><label>Status</label>
        <select id="ie-status">${state.columns
          .map(
            (c) =>
              `<option value="${c.id}"${c.id === it.status ? " selected" : ""}>${escapeHtml(
                c.label,
              )}</option>`,
          )
          .join("")}</select></div>`
    foot.appendChild(me)
    const shot = me.querySelector(".shot")
    if (shot) {
      shot.addEventListener("click", () =>
        window.open(it.screenshotUrl, "_blank"),
      )
      shot.addEventListener("error", () => {
        const r = shot.closest(".r")
        if (r) r.remove()
      })
    }
    me.querySelector("#ie-prio").addEventListener("change", (e) =>
      patchIssue({ priority: e.target.value }),
    )
    me.querySelector("#ie-status").addEventListener("change", (e) =>
      patchIssue({ status: e.target.value }),
    )

    const cp = document.createElement("form")
    cp.className = "compose"
    cp.innerHTML = `<button type="button" class="att" title="Attach (coming soon)" disabled>${I.clip}</button>
      <input id="ie-reply" placeholder="Type a reply…" autocomplete="off" />
      <button class="send" type="submit">${I.send}</button>`
    foot.appendChild(cp)
    cp.addEventListener("submit", async (e) => {
      e.preventDefault()
      const inp = cp.querySelector("#ie-reply")
      const v = inp.value.trim()
      if (!v) return
      inp.value = ""
      try {
        const c = await apiPost(`/widget/issues/${it.id}/comments`, { body: v })
        state.thread.push(c)
        render()
      } catch (err) {
        console.error("[tesuto]", err)
        inp.value = v
      }
    })

    shell.appendChild(foot)
    cp.querySelector("#ie-reply").focus()
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

  function bubble({ body, author, createdAt, me }) {
    const d = document.createElement("div")
    d.className = "msg" + (me ? " me" : "")
    d.style.display = "flex"
    d.style.flexDirection = "column"
    d.innerHTML = `<span class="bub">${escapeHtml(body)}</span>
      <span class="by">${
        author
          ? `<span class="av" style="background:${author.color || PURPLE}">${initials(
              author.name,
            )}</span>${escapeHtml(author.name)} · `
          : ""
      }${ago(createdAt)}</span>`
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
  const pkOverlay = document.createElement("div")
  pkOverlay.className = "pk-overlay"
  pkOverlay.style.display = "none"
  const pkTag = document.createElement("div")
  pkTag.className = "pk-tag"
  pkOverlay.appendChild(pkTag)
  root.appendChild(pkOverlay)
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
    pkOverlay.style.display = "block"
    pkOverlay.style.top = r.top + "px"
    pkOverlay.style.left = r.left + "px"
    pkOverlay.style.width = r.width + "px"
    pkOverlay.style.height = r.height + "px"
    pkTag.textContent = selectorFor(el)
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
      wrap.innerHTML = `<img class="shot-img" alt="screenshot" /><button type="button" class="linkbtn" id="cp-shot-x">Remove screenshot</button>`
      wrap.querySelector("img").src = state.shot
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

  function renderCompose() {
    const p = state.picked || {}
    const isPin = !!p.pin
    shell.appendChild(
      headEl({
        back: () => {
          state.picked = null
          void stopRecording().then(() => {
            state.rec = null
            state.recState = "idle"
          })
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
      <div class="note">${
        consoleErrors.length + failedRequests.length
      } page signal(s) will be attached.</div>
      <div class="btnrow stick">
        <button class="btn ghost" type="button" id="cp-cancel">Cancel</button>
        <button class="btn primary" type="submit" id="cp-send">Post comment</button>
      </div>`
    shell.appendChild(form)
    renderShot()
    renderRec()
    form.querySelector("#cp-title").focus()
    form.querySelector("#cp-cancel").addEventListener("click", () => {
      state.picked = null
      void stopRecording().then(() => {
        state.rec = null
        state.recState = "idle"
      })
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
          domSnapshot: dom,
          context: {
            browser: navigator.userAgent,
            viewport: `${innerWidth}×${innerHeight}`,
            consoleErrors: consoleErrors.length ? consoleErrors.slice() : undefined,
            failedRequests: failedRequests.length ? failedRequests.slice() : undefined,
          },
        })
        state.picked = null
        state.shot = null
        state.rec = null
        state.recState = "idle"
        clearPinMark()
        await loadIssues()
        go("page")
      } catch (err) {
        btn.disabled = false
        btn.textContent = "Post comment"
        console.error("[tesuto]", err)
        const note = form.querySelector(".note")
        note.textContent = "Couldn't post — please try again."
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
