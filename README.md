# Tesuto

Internal bug- and ticket-tracking tool: a point-at-the-UI reporting widget, a
kanban board, per-ticket comments, per-user GitHub sync, and Slack/email
notifications.

Full product spec: [`docs-plan/Tesuto — Build Plan.md`](./docs-plan/Tesuto%20%E2%80%94%20Build%20Plan.md).

## Stack

- **Next.js 16** (App Router, Turbopack) · React 19
- **Tailwind CSS v4** + Base UI primitives (shadcn-style `components/ui`)
- **dnd-kit** for the board
- **Postgres 17 + Prisma 7** backend, route handler API (`app/api/**`)
- **Bun** as package manager and runtime
- State lives in a client-side store (`lib/store.tsx`) backed by the real API
  (`lib/api-client.ts`) and a `GET /api/bootstrap` snapshot.

## Getting started

```bash
docker compose up -d    # Postgres on localhost:15433
bun install
bun run db:migrate      # first time / after schema changes
bun run dev             # http://localhost:3005
```

Other scripts:

```bash
bun run build      # production build (type-checked, `prisma generate` first)
bun run start      # serve the production build
bun run smoke      # end-to-end replay of the client's API calls (server must be up)
bun run lint       # biome lint
bun run format     # biome format --write
bun run check      # biome check --write  (lint + format + import sort)
bun run typecheck  # tsc --noEmit
```

Linting and formatting are handled by [Biome](https://biomejs.dev) (`biome.json`).

## Webhook set-up — sending to Slack / email / GitHub

Copy `.env.example` → `.env` and configure:

| Var | Effect |
|---|---|
| `SLACK_WEBHOOK_URL` | Global incoming webhook; every event (ticket created / assigned / moved to done / commented) posts here. Unset = Slack notifications off. |
| `RESEND_API_KEY` + `EMAIL_FROM` | Emails ticket events to the assignee (never the actor, never inactive users). Unset = email off. |
| `APP_URL` | Public origin, used for links inside Slack/email messages and OAuth redirects. Defaults to `http://localhost:3005`. |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials. Set the callback URL to `APP_URL/api/github/callback`. |
| `GITHUB_REDIRECT_URI` | Optional override for the OAuth callback (defaults to `<origin>/api/github/callback`). |
| `APP_SECRET` | Long random string — encrypts GitHub access tokens at rest and signs OAuth state. Required for GitHub connect/sync. |
| `DATABASE_URL` | Postgres connection string (matches `docker-compose.yml`). |

Two things need to line up for a GitHub sync: each **user** connects their
account (Settings → Connections, OAuth, `repo` scope), and each **project**
names a target repo (project → settings → GitHub sync). Sync is manual per
ticket and creates an issue under the syncing user's account.

### Integration toggles + importing from external trackers

Admins get an **Integrations** section in Settings with workspace-wide
switches: Slack notifications, email notifications, GitHub sync, GitHub
Projects import, and ClickUp import. All default to **on**; Slack and email
additionally need their env vars (they show "not configured" otherwise).

**Import** (Projects → Import) pulls an external board into a new Tesuto
project:

- **GitHub Projects (v2)** — reads boards via the GraphQL API using each
  user's own OAuth connection (needs the `read:project` scope, granted since
  the connection flow was updated — reconnect once if you linked before).
  Items import as tasks, priority medium; closed/merged items start resolved.
- **ClickUp** — paste a personal `pk_…` API token in the dialog; it is sent
  server-side per request and never persisted. Pick a workspace, then a list
  (folders included). Closed tasks arrive resolved; priorities map
  urgent/high/normal→medium/low.

Imported projects get a description noting their source; nothing is pushed
back to GitHub or ClickUp.

## What works today

| Area | Notes |
|---|---|
| Landing (`/`) | marketing page |
| Widget demo (`/widget`) | picker → project-token auth → `html-to-image` screenshot → drag-and-drop box/pin annotations → files a real ticket through `/api/widget/*` |
| Inbox (`/inbox`) | filters, search, stats |
| Boards (`/boards`) | create kanban views spanning one or more projects; `/board` is the everything view |
| Projects (`/projects`) | create projects; each gets a publishable widget token + embed snippet + GitHub repo at `/projects/[id]/settings` |
| Sprints (`/sprints`) | per-project sprints, burndown chart, mini board |
| Ticket detail (`/tickets/[id]`) | WYSIWYG description editor, status/priority/assignee, comments, activity trail + assignment timing, annotated screenshot, GitHub sync |
| Analytics (`/analytics`) | throughput, cycle time, team performance, project/type breakdown, aging — hand-rolled SVG charts |
| Users (`/team`) | admin-only user management (roles, activate/deactivate) |
| Profile (`/profile`) | edit your details, see your stats |
| Settings (`/settings`) | profile, GitHub (OAuth) connection, integration toggles (admin) |

## Not built yet (from the spec)

- **Two-way GitHub sync / webhook** — Tesuto offers manual per-ticket issue
  creation only; the board is the source of truth (spec §7).
- **Widget v1 rebuild** — `public/widget.js` is the standalone dependency-free
  bundle and works against `/api/widget/*`; UI parity with the panel mockup
  is still in progress.

## Design

UI polish follows the [`impeccable`](https://impeccable.style) skill
(`.agents/skills/impeccable`). Run its commands (e.g. `/impeccable polish`,
`/impeccable audit`) against a surface before shipping changes to it.

