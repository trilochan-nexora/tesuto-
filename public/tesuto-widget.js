/**
 * Tesuto widget loader — framework-agnostic ESM module.
 *
 *   import { initTesutoWidget } from "http://localhost:3005/tesuto-widget.js"
 *   // or copy this file into your project
 *
 *   initTesutoWidget({ token: "tsto_pk_…" })
 *
 * Call it once, on the client, after the app has mounted. Safe to call again;
 * it only loads once. Options:
 *   token      required — a project's widget token (Tesuto → project → settings)
 *   origin     where widget.js is served (default: this module's origin)
 *   assertion  signed host-identity assertion minted by your server (verified
 *              mode — Tesuto proves the signature before trusting the user)
 *   user       legacy dev mode — bare { name, email } claim, no proof
 *   endpoint   POST reports here as JSON instead of the localStorage fallback
 *   shortcut   keyboard toggle, e.g. "alt+b" (default "mod+shift+b")
 *   alwaysVisible  skip the 5-click corner reveal gesture (meant for public
 *                  embeds "in the wild") — for a trusted internal app where
 *                  the launcher should just be there for its own staff
 */

let started = false

export function initTesutoWidget(opts = {}) {
  if (typeof window === "undefined") return
  if (started || window.__tesutoWidget) return
  if (!opts.token) {
    console.warn("[tesuto] initTesutoWidget: missing `token`")
    return
  }
  started = true

  let origin = opts.origin
  if (!origin) {
    try {
      origin = new URL(".", import.meta.url).origin
    } catch {
      origin = window.location.origin
    }
  }

  window.__TESUTO__ = {
    token: opts.token,
    origin: origin.replace(/\/$/, ""),
    // verified mode: signed identity assertion from your server (preferred)
    assertion: opts.assertion,
    // legacy dev mode: the host app's signed-in user — { name, email } — so
    // the widget needs no sign-in of its own
    user: opts.user,
    shortcut: opts.shortcut,
    alwaysVisible: opts.alwaysVisible,
  }

  const s = document.createElement("script")
  s.src = origin.replace(/\/$/, "") + "/widget.js"
  s.defer = true
  ;(document.head || document.documentElement).appendChild(s)
}

export default initTesutoWidget
