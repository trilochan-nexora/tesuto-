# Tesuto

Internal bug- and ticket-tracking tool: a point-at-the-UI reporting widget, a
kanban board, per-ticket comments, and per-user GitHub sync.

Full product spec: [`docs-plan/Tesuto — Build Plan.md`](./docs-plan/Tesuto%20%E2%80%94%20Build%20Plan.md).

## Stack

- **Next.js 16** (App Router, Turbopack) · React 19
- **Tailwind CSS v4** + Base UI primitives (shadcn-style `components/ui`)
- **dnd-kit** for the board
- **Bun** as package manager and runtime
- State lives in a client-side store (`lib/store.tsx`) seeded from `lib/data.ts`
  and persisted to `localStorage`. There is **no backend yet** — see below.

## Getting started

```bash
bun install
bun run dev        # http://localhost:3000
```

Other scripts:

```bash
bun run build      # production build (type-checked)
bun run start      # serve the production build
bun run lint       # biome lint
bun run format     # biome format --write
bun run check      # biome check --write  (lint + format + import sort)
bun run typecheck  # tsc --noEmit
```

Linting and formatting are handled by [Biome](https://biomejs.dev) (`biome.json`).

## What works today

Everything runs against the in-memory store (`lib/store.tsx`), persisted to
`localStorage`.

| Area | Notes |
|---|---|
| Landing (`/`) | marketing page |
| Widget demo (`/widget`) | picker → token auth → `html-to-image` screenshot → drag-and-drop box/pin annotations → files a real ticket |
| Inbox (`/inbox`) | filters, search, stats |
| Boards (`/boards`) | create kanban views spanning one or more projects; `/board` is the everything view |
| Projects (`/projects`) | create projects; each gets a publishable widget token + embed snippet at `/projects/[id]/settings` |
| Sprints (`/sprints`) | per-project sprints, burndown chart, mini board, scope management |
| Requirements (`/requirements`) | write or upload `.docx` / `.md` / `.txt`, "break into requirements" (heuristic, no LLM), bulk-create tickets |
| Ticket detail (`/tickets/[id]`) | WYSIWYG description editor, status/priority/assignee/sprint, comments, activity trail + assignment timing, annotated screenshot, GitHub sync |
| Analytics (`/analytics`) | throughput, cycle time, team performance, project/type breakdown, aging — hand-rolled SVG charts |
| Users (`/team`) | admin-only user management (roles, activate/deactivate) |
| Profile (`/profile`) | edit your details, see your stats |
| Docs (`/docs`), Settings (`/settings`) | reader; GitHub connection |

## Not built yet (from the spec)

These are the items the build plan calls for that still need real
infrastructure — the UI is wired against the in-memory store as a stand-in:

- **Database** — Postgres + Prisma (`prisma/schema.prisma`)
- **Auth** — Auth.js session cookie scoped to the shared parent domain
- **`/api/widget-token`** — short-lived scoped JWT exchange (spec §4)
- **`/api/tickets`, `/api/tickets/[id]/comments`** — route handlers + Zod schemas
- **GitHub OAuth + `/api/github/sync/[ticketId]`**

`public/widget.js` **is** built — a real, dependency-free embed script
(`<script src="/widget.js" data-project-token="…">`). With no backend it writes
straight into the `localStorage` store, so a ticket filed from the widget on any
page shows up on the board; point `data-endpoint` at a real API once one exists.

The store's public surface (`addTicket`, `updateTicket`, `moveTicket`,
`addComment`, `syncToGithub`, …) is shaped to map onto those endpoints later.

## Design

UI polish follows the [`impeccable`](https://impeccable.style) skill
(`.agents/skills/impeccable`). Run its commands (e.g. `/impeccable polish`,
`/impeccable audit`) against a surface before shipping changes to it.
