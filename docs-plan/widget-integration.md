# Embedding the Tesuto widget

The widget is one script served by the Tesuto app. Assume Tesuto is at
`http://localhost:3005` — change the origin everywhere below if it's elsewhere.

Two files are served, both CORS-open and cacheable:

| URL | What it is |
|---|---|
| `/widget.js` | the widget itself — a plain IIFE, no build step |
| `/tesuto-widget.js` | an ESM loader (`initTesutoWidget`) for framework code with no HTML shell |

## What the reporter can do

- **Pick a broken element** (`↑` selects its parent) and file a ticket with the
  console errors and failed requests the widget captured from page load.
- **Screenshot, automatic** — picking an element immediately fires the browser's
  native `getDisplayMedia` prompt (the pick click is the required user gesture).
  One frame is grabbed to a canvas, the picked element is outlined in red when
  the shared surface is this tab, and it's stored as the ticket's
  `screenshotUrl`. No dependency. Cancel the prompt and the form just shows an
  "Add screenshot" button to retry; "Retake" / "Remove" once one is attached.
  Chromium pre-selects the current tab; other browsers show the full picker.
- **Chat on the ticket** — after filing (store mode only), a chat panel opens on
  that ticket. Messages are the ticket's Tesuto comments, so they appear in the
  board's Discussion tab and replies typed there stream back into the panel
  (polled every 2.5s). A "💬 Chat" pill reopens the latest thread.

## Get a token

`data-project-token` / `token` comes from Tesuto: **Projects → pick one →
"Widget token"**. Any project's token works; it decides which board the tickets
land on. The seeded **Sandbox** project's token is fine for testing.

## Filing mode

Tesuto now has a real backend, so **point the widget at it**:

```
data-endpoint="https://tesuto.example.com/api/widget/issues"
```

The widget `POST`s JSON with `Authorization: Bearer <project-token>`; the route
resolves the project, files the ticket (reporter = the "Widget" system user),
answers CORS/`OPTIONS` for any origin, and returns `{ data: { id, key, title } }`.
Issues land on the board immediately; the Tesuto tab re-pulls on focus so they
appear within a tab-switch. The `apps/web` / `apps/admin` embeds already pass
this endpoint (`tesuto-widget.tsx`).

- **Legacy `localStorage` mode** (no `endpoint`): the widget writes to
  `localStorage["tesuto:v3"]`. This is now a **dead end** — the app reads from
  the API, not `localStorage` — so always set `endpoint`.
- Per-ticket **chat** is disabled in `endpoint` mode until the widget redesign
  wires it to `/api/widget/issues/:id/comments`.

---

## Plain HTML

```html
<script
  src="http://localhost:3005/widget.js"
  data-project-token="tsto_pk_…"
  defer
></script>
```

Put it before `</body>` in the shared layout/template.

## React — Vite / CRA / any SPA

No `index.html` edit needed. Add a component and render it once near the root.

```tsx
// TesutoWidget.tsx
import { useEffect } from "react"
import { initTesutoWidget } from "http://localhost:3005/tesuto-widget.js"

export function TesutoWidget(props: {
  token: string
  endpoint?: string
  shortcut?: string
}) {
  useEffect(() => {
    initTesutoWidget(props)
  }, [])
  return null
}
```

```tsx
// main.tsx / App.tsx
<TesutoWidget token={import.meta.env.VITE_TESUTO_TOKEN} />
```

Prefer not to import from a URL? Copy `public/tesuto-widget.js` from the Tesuto
repo into your project and import it locally:
`import { initTesutoWidget } from "./tesuto-widget"`.

## TanStack Router (SPA)

Same as React. Mount `<TesutoWidget>` in the root route component:

```tsx
// routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TesutoWidget } from "../TesutoWidget"

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TesutoWidget token={import.meta.env.VITE_TESUTO_TOKEN} />
    </>
  ),
})
```

## TanStack Start

Load it from the client entry so it never runs on the server:

```tsx
// src/client.tsx  (or wherever hydrateRoot is called)
import { initTesutoWidget } from "http://localhost:3005/tesuto-widget.js"

initTesutoWidget({ token: import.meta.env.VITE_TESUTO_TOKEN })
```

Or the `<TesutoWidget>` component in `routes/__root.tsx` — its `useEffect`
already makes it client-only.

## Next.js (App Router)

```tsx
// app/layout.tsx
import Script from "next/script"

<Script
  src="http://localhost:3005/widget.js"
  strategy="afterInteractive"
  data-project-token={process.env.NEXT_PUBLIC_TESUTO_TOKEN}
/>
```

## Vue / Svelte / Angular / Astro / etc.

Use the loader in a client-only lifecycle hook (`onMounted`, `onMount`,
`ngAfterViewInit`, a `client:only` island):

```js
import { initTesutoWidget } from "http://localhost:3005/tesuto-widget.js"
initTesutoWidget({ token: "tsto_pk_…" })
```

---

## Verify

Load a page. A **"Report a bug"** pill appears bottom-right;
`Cmd/Ctrl+Shift+B` also toggles it. Pick a broken element (`↑` selects its
parent) — the screen-share prompt fires right away; grant it and the shot lands
in the form with the element outlined. Fill the form, submit.

- localStorage mode + same origin as Tesuto → the ticket shows on the board,
  the chat panel opens, and a reply from the board's Discussion tab appears in
  the panel within a few seconds.
- `endpoint` mode → confirm the `POST` reached your API (screenshot arrives as
  the `screenshot` field); the form ends at `✓ Filed …`, no chat.

Don't vendor `widget.js` — always load it from the Tesuto origin so it stays
current. `tesuto-widget.js` is small and stable enough to copy if you prefer.
