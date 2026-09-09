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
 * A side panel: sign in (name + email), comment on an element or drop a pin,
 * browse this page's issues or the whole project's, open an issue to chat and
 * change its priority / status. Talks to `<origin>/api/widget/*`.
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
  let TOKEN =
    lsGet(PT_KEY) || cfg.token || attr("project-token") || ""
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
      // session expired (not a bad project token)
      if (userToken && !/token/i.test(msg)) {
        userToken = null
        ls.del(TK_KEY)
        state.me = null
        go("signin")
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
  const apiDel = (p) => apiRaw("DELETE", p)

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
  async function captureScreenshot(view) {
    const md = navigator.mediaDevices
    if (!md || typeof md.getDisplayMedia !== "function") {
      throw new Error("unsupported")
    }
    let stream
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
    try {
      const track = stream.getVideoTracks()[0]
      let source
      let sw
      let sh
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
        host.appendChild(video)
        await video.play().catch(() => {})
        await new Promise((r) => setTimeout(r, 250))
        source = video
        sw = video.videoWidth || 1280
        sh = video.videoHeight || 720
        video.remove()
      }
      const scale = Math.min(1, 1600 / sw)
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(sw * scale)
      canvas.height = Math.round(sh * scale)
      const ctx = canvas.getContext("2d")
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
      if (view && view.vw && view.vh) {
        const arCap = sw / sh
        const arView = view.vw / view.vh
        if (Math.abs(arCap - arView) / arView < 0.12) {
          const kx = canvas.width / view.vw
          const ky = canvas.height / view.vh
          ctx.lineWidth = Math.max(2, Math.round(canvas.width / 480))
          ctx.strokeStyle = "#ef4444"
          ctx.fillStyle = "rgba(239,68,68,0.14)"
          ctx.fillRect(view.x * kx, view.y * ky, view.w * kx, view.h * ky)
          ctx.strokeRect(view.x * kx, view.y * ky, view.w * kx, view.h * ky)
        }
      }
      return canvas.toDataURL("image/jpeg", 0.9)
    } finally {
      stream.getTracks().forEach((t) => t.stop())
    }
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
  @media (prefers-color-scheme: light) {
    .wrap[data-theme="system"] { --bg:#ffffff; --panel:#f7f7f8; --card:#ffffff; --line:#e4e4e7;
      --text:#18181b; --muted:#71717a }
  }

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
  .head h1 { margin: 0; font-size: 19px; font-weight: 700; line-height: 1.2 }
  .head p { margin: 3px 0 0; font-size: 12.5px; color: rgba(255,255,255,.8) }
  .head .back { background: none; border: none; color: #fff; cursor: pointer; padding: 2px; margin: -2px 4px -2px -2px }
  .head .idico { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
    font-size: 12px; font-weight: 700; color: #fff; flex: none }
  .themebar { display: inline-flex; gap: 2px; margin-left: auto; background: rgba(255,255,255,.14);
    border-radius: 9px; padding: 3px }
  .themebar button { background: none; border: none; color: rgba(255,255,255,.7); cursor: pointer;
    width: 26px; height: 24px; border-radius: 6px; display: grid; place-items: center }
  .themebar button[aria-pressed="true"] { background: rgba(255,255,255,.25); color: #fff }
  .themebar svg { width: 14px; height: 14px }
  .head .acts { margin-left: auto; display: flex; gap: 4px }
  .head .acts button { background: rgba(255,255,255,.12); border: none; color: #fff; cursor: pointer;
    width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center }
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
  .shotthumb { position: absolute; right: 14px; top: -46px; width: 74px; height: 60px; border-radius: 8px;
    border: 1px solid var(--line); object-fit: cover; background: var(--card) }

  .compose { display: flex; align-items: center; gap: 8px; padding: 10px 12px }
  .compose .att { background: none; border: none; color: var(--muted); cursor: pointer; padding: 4px }
  .compose input { flex: 1; background: var(--card); color: var(--text); border: 1px solid var(--purple);
    border-radius: 9px; padding: 10px 12px; font-size: 13px; font-family: inherit; outline: none }
  .compose .send { width: 38px; height: 38px; border-radius: 9px; border: none; background: var(--purple);
    color: #fff; cursor: pointer; display: grid; place-items: center; flex: none }
  .compose .send svg { width: 16px; height: 16px }

  .powered { text-align: center; font-size: 11px; color: var(--muted); padding: 9px; border-top: 1px solid var(--line);
    display: flex; align-items: center; justify-content: center; gap: 6px }
  .powered b { color: var(--text); font-weight: 700 }
  .powered .mark { width: 15px; height: 15px; border-radius: 4px; background: linear-gradient(140deg,#ff5cf0,#7c5cff);
    display: grid; place-items: center; color: #fff; font-size: 9px; font-weight: 800 }

  .userbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px;
    font-size: 12.5px; color: var(--muted) }
  .userbar .signout { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 12.5px;
    display: inline-flex; align-items: center; gap: 6px }
  .userbar .signout svg { width: 14px; height: 14px }

  /* forms */
  .form { padding: 16px }
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
  .pin-mark { position: fixed; width: 26px; height: 26px; margin: -26px 0 0 -13px; z-index: 2147483001; pointer-events: none;
    color: ${PURPLE} }
</style>`

  /* -------------------------------- icons -------------------------------- */
  const I = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
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
  }

  const PRIORITIES = ["urgent", "high", "medium", "low"]
  const plabel = (p) => p[0].toUpperCase() + p.slice(1)
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
    view: "collapsed", // collapsed | tokenprompt | signin | actions | page | all | pick | pin | compose | issue
    theme: ls.get(THEME_KEY) || "system",
    badToken: false,
    project: null,
    me: null,
    columns: [],
    picked: null, // { selector, tag, text, rect, view } | { pin:{x,y} }
    shot: null,
    shotState: "idle",
    lastShotErr: "",
    issues: { page: [], all: [] },
    issue: null,
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
    if (state.view === "collapsed") go(state.me ? "actions" : "signin")
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
    state.view = view
    render()
  }
  function collapse() {
    stopPick()
    stopThreadPoll()
    state.view = "collapsed"
    render()
  }

  function render() {
    const open = state.view !== "collapsed"
    panel.style.display = open ? "flex" : "none"
    fab.style.display = open ? "none" : "grid"
    fab.innerHTML = I.chevU
    if (!open) return

    shell.innerHTML = ""
    if (state.view === "tokenprompt" || !TOKEN || state.badToken) {
      return renderTokenPrompt()
    }
    if (state.view === "signin" || !state.me) return renderSignin()
    if (state.view === "compose") return renderCompose()
    if (state.view === "issue") return renderIssue()
    renderMain()
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
    box.innerHTML = `<h1>${escapeHtml(title)}</h1>${sub ? `<p>${escapeHtml(sub)}</p>` : ""}`
    row.appendChild(box)
    if (right) row.appendChild(right)
    else row.appendChild(themeBar())
    h.appendChild(row)
    return h
  }

  function themeBar() {
    const bar = document.createElement("div")
    bar.className = "themebar"
    ;[
      ["light", I.sun],
      ["dark", I.moon],
      ["system", I.monitor],
    ].forEach(([t, svg]) => {
      const b = document.createElement("button")
      b.innerHTML = svg
      b.setAttribute("aria-pressed", String(state.theme === t))
      b.setAttribute("aria-label", t)
      b.addEventListener("click", () => setTheme(t))
      bar.appendChild(b)
    })
    return bar
  }

  function poweredEl() {
    const p = document.createElement("div")
    p.className = "powered"
    p.innerHTML = `Made by <span class="mark">N</span><b>Nexora</b>`
    return p
  }

  function footEl() {
    const f = document.createElement("div")
    f.className = "foot"
    const ub = document.createElement("div")
    ub.className = "userbar"
    ub.innerHTML = `<span>${escapeHtml(state.me ? state.me.name : "")}</span>`
    const so = document.createElement("button")
    so.className = "signout"
    so.innerHTML = `Sign out ${I.out}`
    so.addEventListener("click", signOut)
    ub.appendChild(so)
    f.appendChild(ub)
    f.appendChild(poweredEl())
    return f
  }

  /* ------------------------------ sign in ------------------------------- */
  function renderSignin() {
    const h = document.createElement("div")
    h.className = "head"
    h.innerHTML = `<div class="row"><div><h1>Sign in</h1><p>Comment on this page with ${escapeHtml(
      (state.project && state.project.name) || "the team",
    )}</p></div></div>`
    h.querySelector(".row").appendChild(themeBar())
    shell.appendChild(h)

    const form = document.createElement("form")
    form.className = "form"
    form.innerHTML = `
      <label>Name</label>
      <input id="si-name" autocomplete="name" placeholder="Ada Lovelace" />
      <label>Email</label>
      <input id="si-email" type="email" autocomplete="email" placeholder="you@company.com" />
      <div class="btnrow"><button class="btn primary" id="si-go" type="submit">Continue</button></div>
      <div class="note" id="si-note"></div>`
    shell.appendChild(form)
    shell.appendChild(poweredOnly())
    form.querySelector("#si-name").focus()
    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      const name = form.querySelector("#si-name").value.trim()
      const email = form.querySelector("#si-email").value.trim()
      const note = form.querySelector("#si-note")
      const btn = form.querySelector("#si-go")
      if (!name || !email) return
      btn.disabled = true
      btn.textContent = "Signing in…"
      try {
        const r = await apiPost("/widget/auth", { name, email })
        userToken = r.token
        ls.set(TK_KEY, r.token)
        await boot()
        go("actions")
      } catch (err) {
        btn.disabled = false
        btn.textContent = "Continue"
        if (err && /token/i.test(err.message || "")) {
          state.badToken = true
          render()
          return
        }
        note.textContent = "Couldn't sign in — check the address and try again."
        note.classList.add("err")
        console.error("[tesuto]", err)
      }
    })
  }

  /* --------------------------- project token prompt -------------------- */
  function renderTokenPrompt() {
    const h = document.createElement("div")
    h.className = "head"
    h.innerHTML = `<div class="row"><div><h1>Connect Tesuto</h1><p>${
      state.badToken
        ? "That token wasn't recognised."
        : "Paste this project's widget token to start."
    }</p></div></div>`
    h.querySelector(".row").appendChild(themeBar())
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
    const foot = document.createElement("div")
    foot.className = "foot"
    foot.appendChild(poweredEl())
    shell.appendChild(foot)
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
        if (userToken) await boot()
        go(state.me ? "actions" : "signin")
      } catch {
        btn.disabled = false
        btn.textContent = "Connect"
        const note = form.querySelector(".note")
        note.textContent = "Not a valid project token."
        note.classList.add("err")
      }
    })
  }

  function poweredOnly() {
    const f = document.createElement("div")
    f.className = "foot"
    f.appendChild(poweredEl())
    return f
  }

  async function signOut() {
    try {
      await apiDel("/widget/auth")
    } catch {}
    userToken = null
    ls.del(TK_KEY)
    state.me = null
    stopThreadPoll()
    go("signin")
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
    tabs.appendChild(mk("all", "All Issues", I.layers))
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
  }

  function renderList(body, which) {
    const list = state.issues[which === "page" ? "page" : "all"]
    if (!list.length) {
      body.innerHTML = `<div class="empty">${
        which === "page"
          ? "No issues reported from this page yet."
          : "No issues in this project yet."
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
      shell.appendChild(headEl({ back: () => go("page"), title: "Loading…" }))
      const b = document.createElement("div")
      b.className = "body"
      shell.appendChild(b)
      return
    }
    const right = document.createElement("div")
    right.className = "acts"
    const b1 = document.createElement("button")
    b1.innerHTML = I.pin
    b1.title = "Where it happened"
    b1.addEventListener("click", () => it.sourceUrl && window.open(it.sourceUrl, "_blank"))
    const b2 = document.createElement("button")
    b2.innerHTML = I.target
    b2.title = it.domSnapshot && it.domSnapshot.selector ? it.domSnapshot.selector : "element"
    right.appendChild(b1)
    right.appendChild(b2)

    shell.appendChild(
      headEl({
        back: () => {
          stopThreadPoll()
          go("page")
        },
        title: it.title,
        sub: `${it.key} · ${it.statusLabel}`,
        idColor: (it.reporter && it.reporter.color) || PURPLE,
        right,
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
    foot.style.position = "relative"

    if (it.screenshotUrl) {
      const img = document.createElement("img")
      img.className = "shotthumb"
      img.src = it.screenshotUrl
      img.addEventListener("click", () => window.open(it.screenshotUrl, "_blank"))
      foot.appendChild(img)
    }

    const me = document.createElement("div")
    me.className = "metaedit"
    me.innerHTML = `
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

    foot.appendChild(poweredEl())
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
  const pkOverlay = document.createElement("div")
  pkOverlay.className = "pk-overlay"
  pkOverlay.style.display = "none"
  const pkTag = document.createElement("div")
  pkTag.className = "pk-tag"
  pkOverlay.appendChild(pkTag)
  root.appendChild(pkOverlay)
  let pkHint = null
  let pinMark = null

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
    showHint("Click an element  ·  ↑ parent  ·  Esc cancel")
    document.addEventListener("mousemove", onPickMove, true)
    document.addEventListener("keydown", onPickKey, true)
    document.addEventListener("click", onPickClick, true)
  }
  function startPin() {
    state.view = "pin"
    panel.style.display = "none"
    fab.style.display = "none"
    showHint("Click anywhere to drop a pin  ·  Esc cancel")
    document.addEventListener("click", onPinClick, true)
    document.addEventListener("keydown", onPickKey, true)
  }
  function stopPick() {
    pkOverlay.style.display = "none"
    hideHint()
    hoverEl = null
    if (pinMark) {
      pinMark.remove()
      pinMark = null
    }
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
    state.picked = {
      pin: { x: e.clientX / innerWidth, y: e.clientY / innerHeight },
      view: { x: e.clientX - 13, y: e.clientY - 26, w: 26, h: 26, vw: innerWidth, vh: innerHeight },
    }
    stopPick()
    openCompose()
  }

  function openCompose() {
    state.shot = null
    state.shotState = "capturing"
    state.lastShotErr = ""
    go("compose")
    // pick click is a user gesture — grab a screenshot now
    void grabShot({ auto: true })
  }

  async function grabShot(opts) {
    state.shotState = "capturing"
    renderShot()
    try {
      state.shot = await captureScreenshot(state.picked && state.picked.view)
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
      wrap.innerHTML = `<div class="shot-status">📷 Grabbing screenshot — allow the share prompt…</div>`
      return
    }
    if (state.shot) {
      wrap.innerHTML = `<img class="shot-img" alt="screenshot" /><button class="linkbtn" id="cp-shot-x">Remove screenshot</button>`
      wrap.querySelector("img").src = state.shot
      wrap.querySelector("#cp-shot-x").addEventListener("click", () => {
        state.shot = null
        state.shotState = "idle"
        renderShot()
      })
      return
    }
    const reason =
      state.shotState === "error"
        ? `<div class="note${
            state.lastShotErr === "unsupported" ? "" : " err"
          }">${
            state.lastShotErr === "unsupported"
              ? "This browser can't capture a screenshot here."
              : "No screenshot attached."
          }</div>`
        : ""
    wrap.innerHTML = `<button class="btn ghost" id="cp-shot-add" style="width:100%">📷 Add screenshot</button>${reason}`
    wrap.querySelector("#cp-shot-add").addEventListener("click", () => grabShot({}))
  }

  function renderCompose() {
    const p = state.picked || {}
    const isPin = !!p.pin
    shell.appendChild(
      headEl({
        back: () => {
          state.picked = null
          go("actions")
        },
        title: isPin ? "New pin comment" : "Comment on element",
      }),
    )
    const form = document.createElement("form")
    form.className = "form"
    form.innerHTML = `
      ${
        isPin
          ? `<div class="sel">pin · ${(p.pin.x * 100) | 0}% , ${(p.pin.y * 100) | 0}%</div>`
          : `<div class="sel">${escapeHtml(p.selector || "")}</div>`
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
      <div class="note">${
        consoleErrors.length + failedRequests.length
      } page signal(s) will be attached.</div>
      <div class="btnrow">
        <button class="btn ghost" type="button" id="cp-cancel">Cancel</button>
        <button class="btn primary" type="submit" id="cp-send">Post comment</button>
      </div>`
    shell.appendChild(form)
    shell.appendChild(poweredOnly())
    renderShot()
    form.querySelector("#cp-title").focus()
    form.querySelector("#cp-cancel").addEventListener("click", () => {
      state.picked = null
      go("actions")
    })
    form.addEventListener("submit", async (e) => {
      e.preventDefault()
      const btn = form.querySelector("#cp-send")
      const title = form.querySelector("#cp-title").value.trim()
      btn.disabled = true
      btn.textContent = "Posting…"
      try {
        const dom = isPin
          ? { selector: "", tag: "", x: p.pin.x, y: p.pin.y }
          : {
              selector: p.selector,
              tag: p.tag,
              text: p.text || undefined,
              rect: p.rect,
              view: p.view,
            }
        await apiPost("/widget/issues", {
          title: title || (isPin ? "Pin comment" : `Issue on ${p.selector}`),
          description: form.querySelector("#cp-desc").value.trim() || undefined,
          priority: form.querySelector("#cp-prio").value,
          sourceUrl: location.href,
          screenshot: state.shot || undefined,
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
    try {
      const [page, all] = await Promise.all([
        apiGet(
          `/widget/issues?scope=page&url=${encodeURIComponent(location.href)}`,
        ),
        apiGet("/widget/issues?scope=all"),
      ])
      state.issues.page = page
      state.issues.all = all
    } catch (err) {
      console.error("[tesuto]", err)
    }
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
      render()
      return
    }
    // validate the project token up front (also gives us the project name for
    // the sign-in screen)
    try {
      state.project = await apiGet("/widget/project")
    } catch {
      state.badToken = true
      render()
      return
    }
    if (userToken) await boot()
    render()
  })()

  /* --------------------------- global shortcut ------------------------- */
  document.addEventListener("keydown", (e) => {
    const want = { mod: e.metaKey || e.ctrlKey, shift: e.shiftKey, alt: e.altKey }
    const key = SHORTCUT[SHORTCUT.length - 1]
    const modsOk = SHORTCUT.slice(0, -1).every((m) => want[m])
    if (modsOk && e.key.toLowerCase() === key) {
      e.preventDefault()
      if (state.view === "collapsed") go(state.me ? "actions" : "signin")
      else collapse()
    }
  })
})()
