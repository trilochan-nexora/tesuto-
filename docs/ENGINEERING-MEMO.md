# Tesuto API, email & mobile audit — 2026-10-26

Working memo for the API-documentation pass. It records what was verified, what
is broken, what was changed in this pass, and what still needs a product or
deployment decision.

## Scope

- Verify the email service (auth mail + ticket notifications).
- Audit the HTTP API and its documentation.
- Document the one endpoint the mobile app needs for reporting a bug, plus the
  auth/session calls around it.
- Implement a real OpenAPI description and an interactive API reference.
- Fix documentation drift that would make a mobile or widget integration fail.

## What was verified

All checks were run against the local dev server (`http://localhost:3005`) and
the project `.env`. Secret values are intentionally not reproduced here.

| Check | Result |
|---|---|
| `GET /api/health/ready` | `200 {"status":"ready","checks":{"database":"ok","media":"ok"}}` |
| Resend API send (`delivered@resend.dev`) | accepted, returned an email id |
| App `sendAuthEmail()` | `SEND_OK` |
| App `sendEmail()` (notification path) | `NOTIFY_SEND_OK` |
| `POST /api/auth/sign-in` for an existing active user | `200 {"data":{"ok":true}}` |
| `POST /api/widget/issues` with `X-Tesuto-Project` only | `401 {"message":"Sign in to continue"}` |
| `POST /api/widget/issues` with `Authorization: Bearer <project token>` | `401 {"message":"Missing project token"}` |
| `NODE_ENV=production` + current `.env` | `appSecret() === ""` |
| `integration.email` setting | `true` |
| `RESEND_API_KEY`, `EMAIL_FROM` | set; `EMAIL_FROM=Hearth <noreply@hearthforrestaurants.com>` |

**Conclusion:** the Resend credentials and the app's send code work. The likely
production failure is configuration, not the transport — see P0 below.

## Findings

### P0 — production email is disabled by the placeholder `APP_SECRET`

`.env` currently has `APP_SECRET=change-me-…`. `deploymentSecret()` deliberately
returns an empty string in production when the value is shorter than 32 chars or
starts with `change-me` (`lib/env.ts`). `loginSecret()` then throws
`Email sign-in is not configured` (503) before it ever calls Resend.

The same secret is used for:

- email sign-in code hashes,
- widget link code hashes,
- GitHub OAuth state signing,
- AES-256-GCM encryption of GitHub tokens,
- signed media URLs.

So this is not only an email bug: in production it also breaks GitHub connect
and screenshot/recording links. Rotating the secret invalidates any GitHub
tokens encrypted with the old one; affected users must reconnect GitHub. That is
why this memo does **not** silently rewrite `.env`.

Fix (operator action, once per deployment):

```bash
openssl rand -base64 48   # put the result in APP_SECRET, 32+ chars
```

Then set `MEDIA_STORAGE_DIR` to a private persistent directory, restart, and
reconnect GitHub accounts if the previous secret had ever encrypted tokens.

### P0 — the widget/mobile documentation describes the wrong auth

`docs-plan/widget-integration.md` says:

```http
POST /api/widget/issues
Authorization: Bearer <project-token>
```

The implementation requires **two** credentials:

```http
POST /api/widget/issues
X-Tesuto-Project: tsto_pk_…
Authorization: Bearer <widget-session-token>
Content-Type: application/json
```

The widget session comes from `POST /api/widget/auth` with a host-signed
assertion (`TESUTO_WIDGET_SECRET`). A project token alone can never file a
ticket. Any mobile client following the old doc gets `401` — which matches the
symptom described.

The reporter is the linked Tesuto user, not the inactive `widget@tesuto.local`
system user as the old doc implies. Widget sessions expire after **15 minutes**
(`WIDGET_SESSION_TTL_MS`), so mobile must re-mint.

### P0 — no OpenAPI description existed

There was no `openapi.yaml`, `openapi.json`, `/swagger`, Swagger, Redoc, or
route index. The only API prose is `docs-plan/widget-integration.md` (stale) and
the README's integration section.

This pass adds:

- a typed OpenAPI 3.1 document (`lib/openapi.ts`),
- `GET /swagger/json` (JSON, CORS-open),
- a self-hosted Swagger UI at `/swagger` (same spec, Authorize + Try it out),
- `bun run api:check`, which fails when a route handler has no spec entry,
- a mobile-specific flow guide (`docs/api/mobile-reporting.md`).

### P0 — email notification rules are narrower than people expect

This is probably the second reason email "isn't working":

- **Email goes to the assignee only**, and only if the recipient is active and
  is not the actor. Creating an unassigned ticket sends no email. Commenting on
  an unassigned ticket sends no email. Status changes on an unassigned ticket
  send no email.
- **Slack receives assignment events only**, despite the README saying every
  event posts there. The code comment in `lib/notify.ts` says the same wrong
  thing.
- Notification delivery is fire-and-forget (`void notify(...)`). Failures are
  logged to the server console and never surface to the caller. In a serverless
  runtime the process may end before the send completes.
- There is no outbox, retry, delivery log, or "send test email" screen. A
  broken Resend key is invisible from the UI.

If the product expectation is "creating/commenting on any ticket emails the
reporter/assignee/team", that is a behavior change, not a config fix. It needs
an outbox or at least awaited delivery plus a `notifications` table.

### P1 — mobile cannot report with one request today

Current mobile flow (three calls, one of which happens on the mobile backend):

1. The host backend signs `{ email, name, exp }` with `TESUTO_WIDGET_SECRET`
   (expiry ≤ 5 minutes).
2. `POST /api/widget/auth` with `X-Tesuto-Project` + `{ assertion }`.
   - `{ linked: true, user, token }` → continue.
   - `{ linked: false, hostEmail }` → run `POST /api/widget/link` then
     `POST /api/widget/link/verify` (email code), which returns the session.
3. `POST /api/widget/issues` with both headers.

If "one POST from mobile" is a hard requirement, the product needs a deliberate
anonymous mode: accept the publishable project token as the only credential and
file as the inactive system reporter. That is a security/product decision
(project tokens are embedded in public pages, so it allows spam), and it cannot
support "see my issues"/comments without a user session. It is **not** implemented
in this pass.

Also missing for flaky mobile networks:

- ~~no `Idempotency-Key` on ticket creation~~ — fixed for widget creates;
- the widget session is only 15 minutes;
- ~~no `Retry-After` header on `429`~~ — fixed;
- rate limiting is in-process memory, not shared across instances.

### P1 — CORS preflight did not allow `DELETE`

`next.config.mjs` advertised `GET,POST,PATCH,OPTIONS` for `/api/widget/*`, but
`DELETE /api/widget/auth` (sign-out) exists. Browser-based widget sign-out would
fail preflight. Fixed to add `DELETE` and expose `X-Request-Id`.

### P1 — response contract inconsistencies

- The old `{ data, error }` envelope mixed transport metadata (`path`, `status`,
  `timestamp`) with payloads and forced `data.data` on list responses. Removed:
  success bodies are returned directly, and failures use RFC 9457
  `application/problem+json` (`type`, `title`, `status`, `detail`, `instance`,
  `code`, `requestId`, optional `errors[]`).
- Deliberate exceptions are `/api/health/*` (direct health JSON), the binary
  `/api/media/{id}` success body, and the GitHub OAuth redirect.
- `DELETE /api/users/{id}` returned no `data` key at all (service returned
  `undefined`, so `JSON.stringify` dropped it). Fixed to return
  `{ deleted: "<id>" }`, matching projects/columns/docs/tickets.
- `POST /api/widget/issues` parses/validates the body **before** authenticating,
  so an unauthenticated malformed request gets `422` instead of `401`. Mostly a
  information-leak/order-of-checks nit; documented in the spec's operation notes.
- OpenAPI cannot express "bearer OR cookie" as one scheme, so the spec lists both
  alternatives and explains the production cookie name in the description.
- There is no URL versioning. The spec is version `1.0.0` but a future breaking
  change has no migration convention yet.

### P2 — operational/documentation drift

- `EMAIL_FROM` contains spaces and angle brackets unquoted; `source .env` in a
  shell fails (Next/dotenv handles it, but scripts should use `bun --env-file`).
- README says Slack receives every event; code only posts assignments.
- README says the widget's chat is not wired in endpoint mode; the widget now
  has `/widget/issues/{id}/comments` calls. The feature is there; the doc was
  stale.
- `docs-plan/widget-integration.md` says the legacy localStorage mode is a dead
  end, but the current `widget.js` still supports it. Endpoint mode remains the
  recommendation.
- `lib/types.ts` still contains `Sprint` types; Prisma has no `Sprint` model.
  Not part of this pass, but a stale type surface.

## Decisions needed

1. **Mobile auth model** — keep host assertion + 15-minute widget session
   (recommended), or add a project-token-only anonymous reporting mode?
2. **Email recipients** — keep assignee-only, or notify reporter/team on create
   and comment? If the latter, add an outbox and a delivery log.
3. **API versioning** — stay unversioned for now, or introduce `/api/v1` before
   mobile ships?
4. **Idempotency** — accept an `Idempotency-Key` on `POST /api/widget/issues`
   so mobile retries don't duplicate reports.

## Deliverables in this pass

- [x] `docs/ENGINEERING-MEMO.md` (this file)
- [x] `lib/openapi.ts` — OpenAPI 3.1 source of truth
- [x] `app/swagger/json/route.ts` — `GET /swagger/json`
- [x] `app/swagger/page.tsx` — self-hosted Swagger UI
- [x] `components/swagger-ui.tsx` + `swagger-ui-dist`
- [x] `scripts/openapi-check.ts` + `bun run api:check`
- [x] `scripts/check-email.ts` + `bun run email:check`
- [x] `docs/api/README.md` — auth, response bodies, errors, CORS, rate limits
- [x] `docs/api/mobile-reporting.md` — exact mobile flow with curl examples
- [x] Correct `docs-plan/widget-integration.md`
- [x] README + `.env.example` updates
- [x] CORS `DELETE` + `X-Request-Id` exposure
- [x] `DELETE /api/users/{id}` returns `{ deleted }`

## Still for the operator / next pass

- [ ] Replace `APP_SECRET` with a real 32+ char random value in the deployed
      environment; restart; reconnect GitHub accounts if needed.
- [ ] Set `MEDIA_STORAGE_DIR` in production.
- [ ] Verify the Resend sending domain is verified for `EMAIL_FROM`.
- [ ] Decide mobile auth model (see above).
- [ ] Decide email recipient rules; add outbox/retry if expanding beyond
      assignee-only.
- [ ] Add `Idempotency-Key` support to widget ticket creation.
- [ ] Move rate limiting to a shared store (Postgres/Redis) if running multiple
      instances.
- [ ] Optionally add `/api/v1` before the mobile client is locked in.

## Verification commands

```bash
bun run api:check                 # route coverage + spec structure
bun run email:check               # send a test through the strict auth path
bun run email:check --to you@example.com
curl -s localhost:3005/swagger/json | head
open http://localhost:3005/swagger
```

`bun run email:check` uses `delivered@resend.dev` by default, which verifies
that Resend accepted the message; it does not prove inbox placement. Use a real
recipient to check the full path.
