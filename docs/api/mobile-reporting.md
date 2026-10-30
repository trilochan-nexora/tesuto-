# Mobile bug reporting

Mobile has three jobs:

1. **File a bug** — `POST /api/widget/issues`
2. **See issues** — `GET /api/widget/issues` and `GET /api/widget/issues/{id}`
3. **Discuss / triage** — comments, status, and priority on the same widget API

All of them use a **widget session**: a 15-minute bearer token minted from a
host-signed assertion. A project token alone cannot file or read anything.

> If "mobile sends exactly one unauthenticated POST and nothing else" is a hard
> requirement, the product needs a new anonymous-reporting mode. The current
> implementation deliberately requires proof of a Tesuto user. See
> [`../ENGINEERING-MEMO.md`](../ENGINEERING-MEMO.md).

## What you need

| Value | Where it comes from | Safe in the app? |
|---|---|---|
| `TESUTO_BASE_URL` | Deployment, e.g. `https://tesuto.example.com` | Yes |
| `TESUTO_PROJECT_TOKEN` | Project settings → `tsto_pk_…` | Yes — publishable |
| `TESUTO_WIDGET_SECRET` | Server env, shared with Tesuto | **No — backend only** |
| A Tesuto user | Admin invite; the host email must match an active account | — |

The mobile client calls **your backend** to get an assertion. The backend signs
it with `TESUTO_WIDGET_SECRET`; the app never sees that secret.

```text
Mobile app ──► your backend /tesuto/assertion ──► signed assertion
     │
     └──► Tesuto POST /api/widget/auth ──► 15-minute widget token
                    │
                    └──► POST /api/widget/issues
```

## 1. Mint the assertion on your backend

Wire format: `base64url(json).base64url(hmac-sha256(body))`.

```ts
import { createHmac } from "node:crypto"

export function tesutoAssertion(user: { email: string; name?: string }) {
  const secret = process.env.TESUTO_WIDGET_SECRET
  if (!secret) throw new Error("TESUTO_WIDGET_SECRET is missing")

  const payload = {
    email: user.email.trim().toLowerCase(),
    name: user.name,
    // Unix seconds. Must be in the future and at most 5 minutes ahead.
    exp: Math.floor(Date.now() / 1000) + 240,
  }

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = createHmac("sha256", secret)
    .update(body)
    .digest("base64url")

  return `${body}.${signature}`
}
```

Rules enforced by `lib/assertion.ts`:

- `email` is required and is lowercased by Tesuto.
- `name` is optional.
- `exp` is unix **seconds**, must be `>= now` and `<= now + 300`.
- The HMAC is over the base64url body, not the decoded JSON.
- Clock skew between your server and Tesuto can invalidate the assertion; keep
  both on NTP. A 240-second TTL leaves margin.
- The assertion is short-lived but reusable until it expires. Mint one per
  sign-in request; do not cache it for hours.

## 2. Exchange the assertion for a widget token

```bash
curl -sS -X POST "$TESUTO_BASE_URL/api/widget/auth" \
  -H "X-Tesuto-Project: $TESUTO_PROJECT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"assertion\":\"$ASSERTION\"}"
```

If the host email is already linked:

```json
{
  "linked": true,
  "user": { "id": "u1", "name": "Ava Chen", "color": "#8b5cf6" },
  "token": "widget-session-token…"
}
```

If it is not linked:

```json
{ "linked": false, "hostEmail": "ava@company.com" }
```

Run the link flow below, then call `/api/widget/auth` again (or use the token
returned by `/api/widget/link/verify`).

**Do not send `Authorization` on `/api/widget/auth`.** It only needs the
project token and the assertion. Sending an unrelated bearer token is harmless
but misleading.

The returned token:

- is scoped to the widget (it cannot call dashboard routes),
- lasts **15 minutes**,
- is opaque; store it in memory and/or platform secure storage,
- is invalidated by `DELETE /api/widget/auth`.

## 3. File a bug — the mobile POST

```bash
curl -sS -X POST "$TESUTO_BASE_URL/api/widget/issues" \
  -H "X-Tesuto-Project: $TESUTO_PROJECT_TOKEN" \
  -H "Authorization: Bearer $WIDGET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Checkout button stays disabled",
    "description": "Tapping Pay does nothing on iOS Safari.",
    "priority": "high",
    "sourceUrl": "https://app.example.com/checkout",
    "context": {
      "browser": "Mobile Safari 18",
      "os": "iOS 18.1",
      "viewport": "390x844",
      "consoleErrors": ["TypeError: undefined is not an object"],
      "failedRequests": ["POST /api/pay 500"],
      "steps": [
        { "kind": "nav", "at": "2026-10-26T09:40:00.000Z", "url": "/checkout" },
        { "kind": "click", "at": "2026-10-26T09:40:12.000Z", "target": "button[data-testid=pay]", "text": "Pay" }
      ]
    }
  }'
```

Success:

```json
{ "id": "cmtuf…", "key": "SAND-42", "title": "Checkout button stays disabled" }
```

### Request body

Only `title` is required. `type` is always `bug`; the server sets it.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required, trimmed, 1–200 chars |
| `description` | string | Max 50,000 chars; sanitized before storage |
| `priority` | `urgent \| high \| medium \| low` | Defaults to `medium` |
| `sourceUrl` | string | Web URL (`https://…`) or app deep link (`myapp://checkout`), max 2,048 chars. `javascript:`/`data:`/`file:`-style schemes are rejected |
| `screenshot` | data URL | `image/png`, `image/jpeg`, `image/webp`; decoded ≤ 6 MB; base64 string ≤ 8,000,000 chars |
| `recording` | data URL | `video/webm`, `video/mp4` (codec params allowed); decoded ≤ 11 MB |
| `voice` | data URL | `audio/webm`, `mp4`, `mpeg`, `ogg`, `wav`; decoded ≤ 8 MB |
| `attachments` | array | Max 3; each `{ name, data }`; decoded ≤ 5 MB; images, video, audio, pdf, json, zip, office, text, csv |
| `domSnapshot` | object | `selector`, `tag`, optional `text`, `rect`, `x`, `y`, `view` |
| `context` | object | `sessionId`, `browser`, `os`, `viewport`, `consoleErrors[≤20]`, `failedRequests[≤20]`, `steps[≤30]` |

Media is sent inline as base64 data URLs. There is no separate upload endpoint.
If the report is large, send text first and add attachments through a comment.

### The two headers are not interchangeable

| Headers sent | Result |
|---|---|
| `X-Tesuto-Project` only | `401 Sign in to continue` |
| `Authorization` only | `401 Missing project token` |
| Both | Works |
| `Authorization: Bearer <project token>` + `X-Tesuto-Project` | `401` — the bearer must be a widget **session** token |

## First-time link flow

The link endpoints need the signed assertion but **not** the project token.
The claimed email must belong to an existing active Tesuto user. If it does not,
the API still returns `{ ok: true }` (anti-enumeration) but no email is sent.

### Step 1 — send a code

```bash
curl -sS -X POST "$TESUTO_BASE_URL/api/widget/link" \
  -H "Content-Type: application/json" \
  -d "{\"assertion\":\"$ASSERTION\",\"email\":\"ava@company.com\"}"
```

```json
{ "ok": true, "email": "av•••@company.com" }
```

### Step 2 — verify and get a session

```bash
curl -sS -X POST "$TESUTO_BASE_URL/api/widget/link/verify" \
  -H "Content-Type: application/json" \
  -d "{\"assertion\":\"$ASSERTION\",\"email\":\"ava@company.com\",\"code\":\"123456\"}"
```

Response is the same `{ linked: true, user, token }` shape as `/widget/auth`.

- Code TTL: 10 minutes.
- Wrong-code attempts: 5, then a new code is required.
- Resend throttle: one per minute per host email.
- The link is keyed by the **host email**. If the host identity changes, the
  user must link again.
- Linking is permanent until changed server-side; the app does not need to link
  on every launch.

## Seeing issues

### My queue

```bash
curl -sS "$TESUTO_BASE_URL/api/widget/issues?scope=all" \
  -H "X-Tesuto-Project: $TESUTO_PROJECT_TOKEN" \
  -H "Authorization: Bearer $WIDGET_TOKEN"
```

`scope=all` is the default and returns only tickets **assigned to the signed-in
user**, newest first.

### What I reported

```bash
curl -sS "$TESUTO_BASE_URL/api/widget/issues?scope=mine" \
  -H "X-Tesuto-Project: $TESUTO_PROJECT_TOKEN" \
  -H "Authorization: Bearer $WIDGET_TOKEN"
```

### Paging

Every list takes `limit` (1–100, default 100). When more rows exist the
response has an `X-Next-Cursor` header; send it back as `cursor` for the next
page. The body is always a plain array.

### Issues reported on a page

```bash
curl -sS "$TESUTO_BASE_URL/api/widget/issues?scope=page&url=https%3A%2F%2Fapp.example.com%2Fcheckout" \
  -H "X-Tesuto-Project: $TESUTO_PROJECT_TOKEN" \
  -H "Authorization: Bearer $WIDGET_TOKEN"
```

`scope=page` matches `sourceUrl` exactly. If `url` is omitted, it returns every
ticket in the project (triage view) — pass the URL if you want a page filter.

Each row:

```json
{
  "id": "cmtuf…",
  "key": "SAND-42",
  "title": "Checkout button stays disabled",
  "status": "in_progress",
  "priority": "high",
  "createdAt": "2026-10-26T09:40:20.000Z",
  "sourceUrl": "https://app.example.com/checkout",
  "reporter": "Ava Chen",
  "comments": 2,
  "selector": "button[data-testid=pay]",
  "elementText": "Pay",
  "open": true
}
```

### One issue

```bash
curl -sS "$TESUTO_BASE_URL/api/widget/issues/$ID" \
  -H "X-Tesuto-Project: $TESUTO_PROJECT_TOKEN" \
  -H "Authorization: Bearer $WIDGET_TOKEN"
```

Returns description, status label, priority, type, media URLs, DOM snapshot, and
context. Media URLs are **signed for 15 minutes**; refetch the issue rather than
persisting a signed URL.

### Comments

```bash
# list (oldest first)
curl -sS "$TESUTO_BASE_URL/api/widget/issues/$ID/comments" \
  -H "X-Tesuto-Project: $TESUTO_PROJECT_TOKEN" \
  -H "Authorization: Bearer $WIDGET_TOKEN"

# add text
curl -sS -X POST "$TESUTO_BASE_URL/api/widget/issues/$ID/comments" \
  -H "X-Tesuto-Project: $TESUTO_PROJECT_TOKEN" \
  -H "Authorization: Bearer $WIDGET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body":"This also happens after a hard refresh."}'
```

A comment needs at least one of `body`, `voice`, or `attachments`; otherwise
`422`.

### Status, priority, and assignee

```bash
curl -sS -X PATCH "$TESUTO_BASE_URL/api/widget/issues/$ID" \
  -H "X-Tesuto-Project: $TESUTO_PROJECT_TOKEN" \
  -H "Authorization: Bearer $WIDGET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"priority":"urgent","status":"in_progress","assigneeId":"<member id>"}'
```

Only fields present change. `status` is a column id; `assigneeId` is an id from
`members`, or `null` to unassign. Both lists come from `/api/widget/bootstrap`.
An unknown or inactive assignee returns `422` with `errors[0].path =
"assigneeId"`. Assigning notifies the assignee exactly like the dashboard.

## Session lifecycle

```text
launch / foreground
  ├─ have token and >2 min left?  → reuse
  └─ otherwise                    → POST /api/widget/auth
                                        ├─ linked:true  → store token
                                        └─ linked:false → link flow
401 on any widget call              → re-auth once, retry the call
```

- Tokens expire after 15 minutes. There is no refresh endpoint.
- A 401 on a report means auth failed **before** creation, so re-auth and retry
  is safe.
- A network timeout or 5xx after the request may have created the ticket.
  Send an `Idempotency-Key` header (8–128 chars of `A-Z a-z 0-9 _ -`, e.g. a
  UUID made when the user taps Submit) and reuse it on every retry of that
  report. A repeated key returns the original `{id,key,title}` with
  `Idempotent-Replayed: true` instead of filing a duplicate.
- `DELETE /api/widget/auth` logs out the widget session. It does not affect the
  user's dashboard session.

## Errors mobile should handle

| Status | What to do |
|---|---|
| `401` | Re-auth (assertion exchange), retry once. Check both headers are present. |
| `403` | Account inactive or disabled integration |
| `404` | Issue was deleted or belongs to another project |
| `422` | Read `errors` and fix the field; do not retry unchanged |
| `429` | Wait `Retry-After` seconds, then retry |
| `500`/`503` | Show a retry UI; include `X-Request-Id` in support reports |

CORS is open for `/api/widget/*`, so a React Native/WebView client can call the
API directly, with any `Origin`. Browser clients can read `X-Request-Id`,
`X-Next-Cursor`, `Retry-After` and `Idempotent-Replayed`.

## Security checklist

- Never embed `TESUTO_WIDGET_SECRET` in the app. Assertions must be minted on
  your backend.
- The project token is public; do not treat it as authentication.
- Store the widget token in memory or Keychain/Keystore, not plain preferences.
- Do not log assertion bodies or tokens.
- Do not persist signed media URLs; they expire.
- Only an active Tesuto user can report or comment.

## Minimal implementation order

1. Backend endpoint that returns `tesutoAssertion(currentUser)`.
2. Mobile: exchange assertion → store token with expiry.
3. Mobile: report form → `POST /api/widget/issues`.
4. Mobile: list/detail screens → `GET /api/widget/issues`.
5. Link flow for users who have not linked before.
6. Comment/triage actions if the mobile app needs them.
