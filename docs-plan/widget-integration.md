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
- **Chat on the ticket** — open an issue from the widget's list and the chat
  panel reads/writes the ticket's Tesuto comments. Replies from the board's
  Discussion tab appear in the panel (polled every 2.5s).
- **Browse this page or your queue** — `scope=page` shows issues for the current
  URL; `scope=all` shows tickets assigned to the signed-in user.
- **Triage** — priority and status can be changed from the issue panel.

## Two things every embed needs

### 1. A project token

`data-project-token` / `token` comes from Tesuto: **Projects → pick one →
"Widget token"**. It decides which board tickets land on and is safe to publish.
Any project's token works; the seeded **Sandbox** project is fine for testing.

### 2. A host-signed identity assertion

The project token identifies the board, not the person. The host must prove who
its signed-in user is by signing an assertion with `TESUTO_WIDGET_SECRET` on its
own server:

```text
base64url({ email, name?, exp }) + "." + base64url(HMAC-SHA256(body, secret))
```

- `exp` is unix **seconds** and must be at most 5 minutes in the future.
- The secret stays server-side. Never put it in HTML, a browser bundle, or a
  mobile app.
- Tesuto verifies the signature, then either signs the host email in (if it is
  already linked) or shows the email-code link screen.

See [`docs/api/mobile-reporting.md`](../docs/api/mobile-reporting.md#1-mint-the-assertion-on-your-backend)
for the exact signing code. The same assertion works for the widget.

If the assertion is missing, the widget shows **"This host must provide a
signed Tesuto identity assertion."**

## Plain HTML

The page must be rendered by a server that can inject a fresh assertion. A
static `.html` file cannot safely contain one.

```html
<script
  src="https://tesuto.example.com/widget.js"
  data-project-token="tsto_pk_…"
  data-assertion="<%= tesutoAssertion(currentUser) %>"
  data-host-name="Hearth"
  defer
></script>
```

If your template engine escapes attributes differently, HTML-escape the
assertion (it is base64url plus a dot, so no special characters are expected).

Put it before `</body>` in the shared layout/template. The widget talks directly
to `<tesuto-origin>/api/widget/*`; there is no `endpoint` option to configure.

## React — Vite / CRA / any SPA

No `index.html` edit needed. Fetch an assertion from your backend, then start
the loader once near the root.

```tsx
// TesutoWidget.tsx
import { useEffect } from "react"
import { initTesutoWidget } from "https://tesuto.example.com/tesuto-widget.js"

export function TesutoWidget(props: {
  token: string
  hostName?: string
}) {
  useEffect(() => {
    let cancelled = false

    async function boot() {
      const res = await fetch("/api/tesuto/assertion", {
        credentials: "include",
      })
      if (!res.ok) return
      const { assertion } = await res.json()
      if (!cancelled) {
        initTesutoWidget({
          token: props.token,
          assertion,
          hostName: props.hostName,
        })
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [props.token, props.hostName])

  return null
}
```

```tsx
// main.tsx / App.tsx
<TesutoWidget token={import.meta.env.VITE_TESUTO_TOKEN} hostName="Hearth" />
```

Prefer not to import from a URL? Copy `public/tesuto-widget.js` from the Tesuto
repo into your project and import it locally:
`import { initTesutoWidget } from "./tesuto-widget"`.

`initTesutoWidget` only starts once per page. It does not expose a way to swap
the assertion later. In a long-lived SPA, reload the widget (or the page) when
the assertion expires; the widget session itself lasts 15 minutes.

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
      <TesutoWidget token={import.meta.env.VITE_TESUTO_TOKEN} hostName="Hearth" />
    </>
  ),
})
```

## TanStack Start

Fetch the assertion in a client-only lifecycle, then start the loader:

```tsx
// src/client.tsx  (or wherever hydrateRoot is called)
import { initTesutoWidget } from "https://tesuto.example.com/tesuto-widget.js"

const res = await fetch("/api/tesuto/assertion", { credentials: "include" })
const { assertion } = await res.json()
initTesutoWidget({
  token: import.meta.env.VITE_TESUTO_TOKEN,
  assertion,
  hostName: "Hearth",
})
```

Or use the `<TesutoWidget>` component in `routes/__root.tsx` — its `useEffect`
already makes it client-only.

## Next.js (App Router)

Mint the assertion on the server and pass it to the script tag. Do not import
`TESUTO_WIDGET_SECRET` into a client component.

```tsx
// app/layout.tsx
import Script from "next/script"
import { tesutoAssertion } from "@/lib/tesuto-assertion"

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const assertion = await tesutoAssertion()
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="http://localhost:3005/widget.js"
          strategy="afterInteractive"
          data-project-token={process.env.NEXT_PUBLIC_TESUTO_TOKEN}
          data-assertion={assertion}
          data-host-name="Hearth"
        />
      </body>
    </html>
  )
}
```

`tesutoAssertion()` is your server helper: read the current user, sign with
`TESUTO_WIDGET_SECRET`, and return the string. Keep it in `server-only` code.

## Vue / Svelte / Angular / Astro / etc.

Use the loader after fetching the assertion in a client-only lifecycle hook
(`onMounted`, `onMount`, `ngAfterViewInit`, a `client:only` island):

```js
import { initTesutoWidget } from "https://tesuto.example.com/tesuto-widget.js"

const res = await fetch("/api/tesuto/assertion", { credentials: "include" })
const { assertion } = await res.json()
initTesutoWidget({ token: "tsto_pk_…", assertion, hostName: "Hearth" })
```

## First-time reporter

If Tesuto has never seen the host email, the widget shows **Link your Tesuto
account**:

1. The reporter enters their Tesuto email.
2. Tesuto mails a 6-digit code (10 minutes, 5 attempts, one resend per minute).
3. The code links the host email to that Tesuto user and signs them in.

The reporter must already be an active Tesuto user. If they are not, an admin
must invite them first (`POST /api/users`). Unknown emails intentionally get the
same success response but no mail.

The link is permanent for that host email; the widget does not ask again.

## Verify

Load a page. A **"Report a bug"** pill appears bottom-right;
`Cmd/Ctrl+Shift+B` also toggles it. Pick a broken element (`↑` selects its
parent) — the screen-share prompt fires right away; grant it and the shot lands
in the form with the element outlined. Fill the form, submit.

- The ticket shows on the board immediately; the Tesuto tab re-pulls on focus.
- Open the issue from the widget list; the chat panel reads/writes real ticket
  comments.
- If you see **"This host must provide a signed Tesuto identity assertion"**,
  the script tag/loader did not receive `assertion`.
- If you see **"That sign-in proof is invalid or expired"**, the assertion is
  older than 5 minutes, signed with the wrong secret, or `exp` is wrong.
- If you see **"Missing project token"** or **"That project token isn't
  recognised"**, check `data-project-token` / `token`.

Don't vendor `widget.js` — always load it from the Tesuto origin so it stays
current. `tesuto-widget.js` is small and stable enough to copy if you prefer.
For the mobile API flow, see
[`docs/api/mobile-reporting.md`](../docs/api/mobile-reporting.md).
