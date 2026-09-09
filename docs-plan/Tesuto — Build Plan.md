# Tesuto — Build Plan

Internal bug/ticket tool: point-at-the-UI widget for reporting bugs, a Jira/GitHub-Projects-style
kanban board, per-ticket comments, and optional per-user GitHub sync.

This doc is written to be handed to a coding agent as a spec. Assumptions I made where you hadn't
picked yet are marked **(assumed — confirm or change)**. Everything else reflects what you chose.

---

## 1. Decisions locked in

| Area | Choice |
|---|---|
| Framework | Next.js 14+, App Router |
| Hosting model | Standalone app, own database, no company/tenant scoping |
| Database | Postgres + Prisma **(assumed — confirm or swap for Drizzle)** |
| Auth (Tesuto itself) | Auth.js (NextAuth) **(assumed)** — session cookie on `.yourcompany.com` |
| GitHub integration | Each teammate connects their **own** GitHub OAuth (Auth.js GitHub provider, or a separate linked-account flow if they already log into Tesuto another way) |
| Widget → Tesuto auth | Shared-cookie SSO is available (same parent domain) **+** short-lived scoped token exchange (see §4) — this is the part to get right, not the fallback |
| Ticket relation to GitHub | Own board is the source of truth. GitHub is a manual, per-ticket "sync" action, not automatic |
| Comments/chat | Simple refetch-on-focus polling to start **(assumed)** — no websocket infra in v1 |
| Linting/conventions | ESLint (`next/core-web-vitals` + `typescript`), Prettier, TypeScript `strict: true`, Conventional Commits |

**Open items:**
- Confirm Postgres+Prisma vs Drizzle.
- Confirm Auth.js vs something else for Tesuto's own login.
- Confirm the actual root domain (e.g. `company.com`) so cookie scoping is set correctly.
- Single Next.js app serving both board UI and API routes (recommended) vs. split API.

---

## 2. Repo structure

```
hearth/
  app/
    (board)/                     # authenticated board UI
      page.tsx                   # kanban board
      tickets/[id]/page.tsx      # ticket detail + comments
    api/
      auth/[...nextauth]/route.ts
      widget-token/route.ts      # issues the scoped widget JWT (see §4)
      tickets/route.ts           # POST create, GET list
      tickets/[id]/route.ts      # GET, PATCH
      tickets/[id]/comments/route.ts
      github/connect/route.ts    # OAuth start
      github/callback/route.ts
      github/sync/[ticketId]/route.ts
  lib/
    db.ts                        # Prisma client singleton
    auth.ts                      # Auth.js config
    widget-token.ts              # sign/verify short-lived JWT
    github.ts                    # GitHub API wrapper (per-user token)
  prisma/
    schema.prisma
  components/
    board/                       # columns, cards, drag-and-drop
    ticket/                      # detail view, comment thread
  widget/                        # published separately, see §5
    src/
      index.ts                   # embed entry point
      picker.ts                  # DOM element picker
      capture.ts                 # screenshot + context capture
      report-form.ts
    package.json                 # builds to a small UMD/ESM bundle
```

---

## 3. Data model (Prisma sketch)

```prisma
model Ticket {
  id            String    @id @default(cuid())
  title         String
  description   String?
  status        String    @default("backlog") // backlog | todo | in_progress | review | done
  priority      String    @default("medium")
  reporterId    String
  assigneeId    String?
  sourceUrl     String?
  domSnapshot   Json?     // selector, outerHTML (truncated), computed style diff
  screenshotUrl String?
  context       Json?     // session info, failed API calls, console errors, breadcrumbs
  githubIssueUrl String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  comments      Comment[]
}

model Comment {
  id        String   @id @default(cuid())
  ticketId  String
  ticket    Ticket   @relation(fields: [ticketId], references: [id])
  authorId  String
  body      String
  createdAt DateTime @default(now())
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  githubLogin   String?
  githubToken   String?  // encrypted at rest
}
```

---

## 4. Auth: how the widget acts as the logged-in user

**Flow:**

1. User is already logged into Tesuto (or any app on the shared domain) via Auth.js — session
   cookie set with `Domain=.yourcompany.com`.
2. The host page loads the widget script.
3. On init, the widget calls `GET /api/widget-token` on Tesuto's origin with
   `credentials: 'include'`. The shared cookie authenticates it without a login screen.
4. `widget-token` route: verifies the Tesuto session, then mints a **short-lived JWT** (60–120s
   expiry, scope `create:ticket` only, embeds `userId`).
5. Widget stores the JWT in memory only and sends it as `Authorization: Bearer <token>` on
   `POST /api/tickets`.
6. The tickets route verifies signature + expiry + scope before creating the ticket.

**If a host app is NOT logged into Tesuto:** `widget-token` returns 401, and the widget shows
"log in to Tesuto to report" with a link — no silent anonymous tickets.

---

## 5. The widget

Ship as its own package (`widget/`), built to a single JS file dropped in via
`<script src="https://hearth.yourcompany.com/widget.js">`.

**Responsibilities:** floating button + keyboard shortcut; `document.elementFromPoint` +
outline overlay; selector priority `data-testid` → `id` → `aria-label` → structural; screenshot
via `html-to-image`; auto-context (URL, console errors, failed API calls); token fetch +
submission; small inline form.

**Not in v1:** replay/state restoration, presence, real-time anything.

---

## 6. Board UI

Columns = `status` values, drag-and-drop with `dnd-kit`. Card shows screenshot thumbnail,
title, priority badge, assignee avatar, comment count. Ticket detail: full screenshot, DOM
snapshot, context blob, comment thread, "Sync to GitHub" button.

---

## 7. GitHub sync

Each user connects their own GitHub account. "Sync to GitHub" on a ticket does
`POST /api/github/sync/[ticketId]` using the current user's token to create an issue, storing
the URL on `Ticket.githubIssueUrl`. No webhook/two-way sync in v1.

---

## 8. Conventions

- TypeScript `strict: true`, no `any` without an explaining `// eslint-disable`.
- ESLint `next/core-web-vitals` + `@typescript-eslint/recommended`. Prettier via pre-commit.
- One Zod schema per API route, used for validation and inferred type.
- Route handlers stay thin: validate → call a `lib/` function → return.
- Conventional Commits.
- Every API route returns `{ data, error }` with `error` always `null` on success.

---

## 9. Build order

1. **Scaffold** — Next.js, Prisma schema + migration, Auth.js with parent-domain cookie,
   ESLint/Prettier/husky.
2. **Ticket CRUD + board UI** — manual create form, drag-and-drop kanban, ticket detail.
3. **`widget-token` route** — implement and test the SSO token exchange in isolation.
4. **Widget v1** — DOM picker, screenshot, submission using the token flow.
5. **Auto-context capture** — console error patching, host-app URL, failed-request info.
6. **Comments** — thread UI + polling refetch.
7. **GitHub OAuth + sync**.

---

## Current implementation status

**Backend is built** (Postgres + Prisma 7 + Next route handlers) and the whole
app runs on it behind a name+email sign-in gate — not the SSO/scoped-JWT design
sketched in §4, but a simpler opaque-bearer-token auth (deliberate for v1).

- **DB**: `docker-compose.yml` (Postgres 17, port 15433, own `pgdata` volume).
  `prisma/schema.prisma` (single file), `prisma/seed.ts` ports `lib/data.ts`.
  `bun run db:migrate` / `db:seed` / `db:studio`.
- **Auth**: `lib/auth.ts` + `/api/auth/{sign-in,sign-out,me}`. Token in
  `localStorage["tesuto:token"]`. `<SignInGate>` in `app/(app)/layout.tsx`;
  sign-out in the sidebar footer.
- **API**: `app/api/**/route.ts` through `handler()` in `lib/api.ts` (Zod +
  `{data,error}` envelope). Logic in `lib/services/*`. `GET /api/bootstrap`
  returns the whole store. Covers tickets/comments/projects/columns/users/
  me/docs + bulk + fake github sync.
- **Client**: `lib/store.tsx` keeps the `useStore()` surface; engine is now
  `lib/api-client.ts` fetches. Create mutations return `Promise`; `moveTicket`
  is optimistic. Sprints dropped. `/widget` demo files through `/api/tickets`.
- **Verify**: `bun run smoke` (scripts/smoke.mjs) — replays the client's calls.

**Not built**: the real `widget.js` bundle (still the `localStorage` prototype;
redesign to the panel mockup + `/api/widget/*` routes is the next pass),
step 7's real GitHub OAuth.
