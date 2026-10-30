# Tesuto HTTP API

Tesuto's API is a Next.js route-handler API under `app/api/**`. This directory is
the human documentation; the machine contract lives in
[`lib/openapi.ts`](../../lib/openapi.ts) and is served as OpenAPI 3.1.

| Where | What |
|---|---|
| `/swagger` | Swagger UI (Authorize + Try it out) |
| `/swagger/json` | OpenAPI 3.1 JSON (`Cache-Control: no-store`) |
| `lib/openapi.ts` | Typed source of truth |
| `bun run api:check` | Fails if a route handler is undocumented, a `$ref` is broken, or path params drift |

Mobile-specific walkthrough:
[`mobile-reporting.md`](./mobile-reporting.md). Audit findings and known gaps:
[`../ENGINEERING-MEMO.md`](../ENGINEERING-MEMO.md).

## Base URL

Calls are same-origin in the dashboard and widget. A native client should use the
deployment origin configured as `APP_URL`:

```text
https://tesuto.example.com
```

There is no `/api/v1` prefix yet. The API is currently unversioned; see
[Versioning](#versioning).

All request and response bodies are JSON (`application/json`) except media
downloads. Send `Content-Type: application/json` on writes.

## Response bodies

Success responses are the payload itself. A collection is a JSON array; a single
resource is the resource object. There is no `{ data, error }` envelope, so
clients do not unwrap `data` and lists are never `data.data`.

Failures use RFC 9457 `application/problem+json`:

```json
{
  "type": "urn:tesuto:problem:validation-error",
  "title": "Validation failed",
  "status": 422,
  "detail": "Validation failed",
  "instance": "/api/tickets",
  "code": "VALIDATION_ERROR",
  "requestId": "…",
  "errors": [
    { "path": "title", "message": "Required", "code": "invalid_type" }
  ]
}
```

- HTTP status is authoritative. The body `status` mirrors it for tools that
  inspect the payload.
- `errors` is present on `422` (Zod validation), and occasionally on other
  validation errors.
- `code` is stable and machine-readable; use it for branching instead of
  matching `detail`.
- Every response carries `X-Request-Id`, also echoed in the problem body. A
  caller-supplied `X-Request-Id` is reused only if it matches
  `^[A-Za-z0-9_-]{8,128}$`.
- Deliberate exceptions:
  - `GET /api/health/live`, `GET /api/health/ready` — direct health JSON.
  - `GET /api/media/{id}` — raw bytes on success; failures use problem JSON.
  - `GET /api/github/callback` — `302` redirect to `/settings`.
- Successful creates return `200`, not `201`. Deletes return the deleted id
  (`{ "deleted": "<id>" }`) or a count, depending on the route.

## Authentication

There are four distinct credential types. Do not mix them up.

### 1. Dashboard (app) session

Email sign-in, two calls:

```http
POST /api/auth/sign-in
Content-Type: application/json

{ "email": "ava@company.com" }
```

```http
POST /api/auth/verify
Content-Type: application/json

{ "email": "ava@company.com", "code": "123456" }
```

`verify` sets an HttpOnly session cookie and returns the user:

```http
Set-Cookie: __Host-tesuto_session=…; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=604800
```

- Production cookie: `__Host-tesuto_session`; development: `tesuto_session`.
- TTL: 7 days.
- API clients that cannot manage cookies can send the same opaque token as
  `Authorization: Bearer <token>`. The `Set-Cookie` value is the only place the
  token is returned.
- Sign-in only works for **existing active users**. There is no self-service
  sign-up; an admin invites people with `POST /api/users`.
- Unknown/inactive addresses still get `{ "ok": true }` from `sign-in`, so the
  endpoint cannot be used to enumerate the directory.
- Codes expire after 10 minutes, are single-use, and allow 5 attempts.
- Cookie-authenticated writes with an `Origin` header must match the
  deployment origin, or the API returns `403 Cross-origin request rejected`.
  Requests that send `Authorization: Bearer` are exempt (CSRF only rides on
  cookies), so native apps and WebViews such as `capacitor://localhost` work.

Admin-only operations: `POST /api/users`, `PATCH /api/users/{id}`,
`DELETE /api/users/{id}`, and `PATCH /api/settings/integrations`.

### 2. Widget / mobile session

A widget user proves identity with a host-signed assertion, then receives a
short-lived widget-scope bearer token.

```text
Host backend signs { email, name?, exp } with TESUTO_WIDGET_SECRET
        │
        ▼
POST /api/widget/auth          X-Tesuto-Project: tsto_pk_…
        │                      body: { assertion }
        ├── { linked: true, user, token }     ← 15-minute bearer token
        └── { linked: false, hostEmail }      ← run the email link flow
        │
        ▼
POST /api/widget/issues         X-Tesuto-Project + Authorization: Bearer
```

Widget issue routes require **both** headers. The project token alone is not
sufficient and never identifies a person. The widget session token alone is not
sufficient and does not identify the board.

```http
X-Tesuto-Project: tsto_pk_…
Authorization: Bearer <widget session token>
Content-Type: application/json
```

- Widget sessions last **15 minutes**; there is no refresh token. Re-run
  `POST /api/widget/auth` when it expires.
- The reporter is the linked Tesuto user, not a shared system account.
- A widget user must already be an active Tesuto user. If the host email is not
  linked, `POST /api/widget/link` mails a 6-digit code to the claimed Tesuto
  address, and `POST /api/widget/link/verify` returns the session after proof.
  The link endpoints require the assertion but **not** the project token.
- The assertion format is `base64url(json).base64url(hmac-sha256(body))`.
  `exp` is unix seconds and must be no more than 5 minutes in the future.
- `TESUTO_WIDGET_SECRET` stays on the host backend. Never ship it to a browser,
  mobile binary, or app-store build.
- The project token (`tsto_pk_…`) is publishable: it identifies the board and is
  embedded in the widget script. It is not a user session and must not be used
  as one.

See [`mobile-reporting.md`](./mobile-reporting.md) for a full signing example.

### 3. Integration secrets

| Route | Credential | Env |
|---|---|---|
| `POST /api/releases` | `X-Release-Secret: …` | `HEARTH_RELEASES_SECRET` |
| `POST /api/maintenance/cleanup` | `Authorization: Bearer …` | `MAINTENANCE_SECRET` |

Both use a constant-time comparison. If the env value is unset, the route
returns `401`. In production, `deploymentSecret()` also rejects a value shorter
than 32 characters or one starting with `change-me`.

### 4. Signed media grants

`GET /api/media/{id}` accepts an app session **or** a grant:

```text
/api/media/<id>?expires=<unix-seconds>&signature=<hmac>
```

Widget issue/comments responses return these signed URLs with a 15-minute
expiry. App responses return the protected path and rely on the session cookie.
Grants are scoped to one media id and one expiry.

## Errors

| Status | Meaning |
|---|---|
| `400` | Malformed or semantically invalid request that Zod did not catch |
| `401` | Missing, invalid, expired, or wrong-scope credentials |
| `403` | Authenticated but not allowed (admin-only, cross-origin, disabled integration, inactive account) |
| `404` | Resource not found (or not visible in the current project) |
| `409` | Conflict: duplicate key/email, last admin, user has history, key allocation failure |
| `422` | Zod validation failed; inspect `errors` |
| `424` | Upstream provider (GitHub/ClickUp) failed; message may include the reason |
| `429` | Rate limited; wait `Retry-After` seconds |
| `500` | Unexpected server error or missing server configuration |
| `503` | Required dependency is not configured (email, widget secret, media storage) |

`429` responses are problem details. Login/link codes also have database-backed
resend throttles (one minute) and attempt limits (five).

## CORS

CORS is open **only** under `/api/widget/*`:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Authorization,Content-Type,X-Tesuto-Project
Access-Control-Expose-Headers: X-Request-Id
Access-Control-Max-Age: 86400
```

- Dashboard routes are same-origin only; they are not CORS-open.
- `OPTIONS` preflight is answered by Next.js and by explicit handlers on the
  widget auth/issues/comments routes. It returns `204`.
- Open CORS is not authentication. Widget issue routes still require the widget
  bearer token; the project token is public by design.
- `X-Request-Id` is exposed so browser clients can read it from error responses.

## Rate limits

The in-process limiter is per instance, keyed by client IP (from
`CF-Connecting-IP`, `X-Real-IP`, or the first `X-Forwarded-For` entry) plus an
optional email key.

| Namespace | Limit | Window |
|---|---|---|
| Sign-in request | 5 per IP + email | 10 min |
| Sign-in verify | 10 per IP + email | 10 min |
| Widget auth | 30 per IP | 10 min |
| Widget report create | 30 per IP | 10 min |
| Widget comment create | 60 per IP | 10 min |
| Widget link start | 5 per IP + email | 10 min |
| Widget link verify | 10 per IP + email | 10 min |

Running multiple instances means each instance has its own bucket. Move this to
Postgres/Redis before relying on it for abuse prevention.

## Conventions

- **IDs** are opaque strings (cuid or seeded demo ids). Treat them as case-sensitive.
- **Timestamps** are ISO 8601 UTC strings in responses.
- **Priorities**: `urgent | high | medium | low`.
- **Issue types**: `bug | feature | task | question`.
- **Ticket status** is a project column id, not a closed enum. Defaults:
  `backlog`, `todo`, `in_progress`, `review`, `done`. Projects can add columns.
- **Ticket keys** look like `SAND-12`; the numeric part is per project.
- **Descriptions/comments** are sanitized server-side before storage.
- **Pagination**: widget issue lists take `limit` + `cursor` and return
  `X-Next-Cursor`. Other lists are bounded sets (comments: latest 200,
  bootstrap: everything). Bulk actions cap at 500 ids.
- **Idempotency**: `POST /api/widget/issues` accepts `Idempotency-Key`. Other
  creates (dashboard tickets, comments) do not yet.

## Endpoint index

`A` = app session, `W` = widget project token + widget bearer, `P` = public,
`S` = integration secret.

### Auth and bootstrap

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/sign-in` | P |
| POST | `/api/auth/verify` | P |
| POST | `/api/auth/sign-out` | A |
| GET | `/api/auth/me` | A |
| GET | `/api/bootstrap` | A |
| GET | `/api/bootstrap/version` | A |

### Tickets and comments

| Method | Path | Auth |
|---|---|---|
| GET, POST | `/api/tickets` | A |
| GET, PATCH, DELETE | `/api/tickets/{id}` | A |
| GET, POST | `/api/tickets/{id}/comments` | A |
| POST | `/api/tickets/{id}/sync-github` | A |
| POST | `/api/tickets/bulk` | A |

### Projects, columns, users, docs

| Method | Path | Auth |
|---|---|---|
| GET, POST | `/api/projects` | A |
| PATCH, DELETE | `/api/projects/{id}` | A |
| POST | `/api/projects/import` | A |
| GET, POST | `/api/columns` | A |
| PATCH, DELETE | `/api/columns/{id}` | A |
| POST | `/api/columns/reorder` | A |
| GET | `/api/users` | A |
| POST | `/api/users` | A + admin |
| PATCH, DELETE | `/api/users/{id}` | A + admin |
| PATCH | `/api/me` | A |
| DELETE | `/api/me/github` | A |
| GET, POST | `/api/docs` | A |
| PATCH, DELETE | `/api/docs/{id}` | A |

`DELETE /api/columns/{id}` takes `projectId` and `reassignTo` as **query
parameters** (the shared handler parses query strings for DELETE).

### Notifications, settings, releases, imports, GitHub

| Method | Path | Auth |
|---|---|---|
| POST | `/api/notifications/seen` | A |
| PATCH | `/api/settings/integrations` | A + admin |
| GET | `/api/releases` | A |
| POST | `/api/releases` | S |
| GET | `/api/import/github/projects` | A |
| POST | `/api/import/github` | A |
| POST | `/api/import/clickup/teams` | A |
| POST | `/api/import/clickup/lists` | A |
| POST | `/api/import/clickup` | A |
| GET | `/api/github/connect` | A |
| GET | `/api/github/callback` | P |

### Widget and mobile

| Method | Path | Auth |
|---|---|---|
| GET | `/api/widget/project` | project token |
| POST | `/api/widget/auth` | project token |
| DELETE | `/api/widget/auth` | widget bearer |
| GET | `/api/widget/bootstrap` | W |
| GET, POST | `/api/widget/issues` | W |
| GET, PATCH | `/api/widget/issues/{id}` | W |
| GET, POST | `/api/widget/issues/{id}/comments` | W |
| POST | `/api/widget/link` | assertion only |
| POST | `/api/widget/link/verify` | assertion only |
| GET | `/api/widget/demo-assertion` | A (dashboard playground only) |

### Ops and media

| Method | Path | Auth |
|---|---|---|
| GET | `/api/health/live` | P |
| GET | `/api/health/ready` | P |
| POST | `/api/maintenance/cleanup` | S |
| GET | `/api/media/{id}` | A or signed grant |
| GET | `/swagger/json` | P |

## Generating a client

The spec is plain OpenAPI 3.1. Fetch it from a running instance:

```bash
curl -s http://localhost:3005/swagger/json > openapi.json
```

Then feed it to your generator of choice. Keep the generated types out of
`lib/openapi.ts`; the spec is written by hand so it can describe product rules
(e.g. "both headers are required") that a generator cannot infer.

Before committing an API change:

```bash
bun run api:check      # coverage + $ref + path-param guardrail
bun run typecheck
bun run lint
curl -s localhost:3005/swagger/json | head
```

`api:check` intentionally fails when a new `route.ts` export has no matching
operation, so the docs cannot silently fall behind.

## Versioning

The API has no URL version. `info.version` is `1.0.0` and changes are expected
to be additive:

- adding optional request fields or response fields,
- adding new routes,
- adding new enum values that clients tolerate.

Breaking changes (removing/renaming fields, changing auth) should either keep
the old shape during a migration or introduce `/api/v1` before a mobile build
depends on it. This is still an open decision in the engineering memo.

## Known limitations

Documented in detail in [`../ENGINEERING-MEMO.md`](../ENGINEERING-MEMO.md):

- Project-token-only mobile reporting is **not** supported; the mobile client
  needs the host assertion exchange.
- `Idempotency-Key` on widget creates only; no outbox, delivery log, or email retry.
- Notification email goes only to an active assignee who is not the actor.
  Unassigned creates/comments send no email.
- Slack receives assignment events only, despite older README claims.
- In-process rate limiting (per instance); `429` carries `Retry-After`.
- No URL versioning.
