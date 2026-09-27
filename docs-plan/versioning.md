# Versioning on /releases

`/releases` shows **Hearth's** version numbers, not Tesuto's — Tesuto has no
release train of its own here, it just mirrors what Hearth's CI posts after
a prod API release (`POST /api/releases`, see `app/api/releases/route.ts`).
So `v2.4.0` means Hearth's API is on 2.4.0; it says nothing about Tesuto's
own version.

If the numbers looked "mismatched" (e.g. expecting `v1.x` and seeing `v2.x`,
or expecting them to start at zero), that's Hearth's own version history —
Hearth was already past `v2.0.0` before this endpoint existed, and older
releases were never backfilled. It's not a bug in Tesuto's ordering; the rail
sorts strictly by `createdAt` (see `components/release-rail.tsx`), newest
first, and the numbers you see are whatever Hearth's CI sent.

## Semantic versioning (SemVer), for reference

Hearth's version strings follow `MAJOR.MINOR.PATCH`:

- **MAJOR** — breaking change. Existing API consumers may need to update.
- **MINOR** — new, backwards-compatible functionality.
- **PATCH** — backwards-compatible bug fix, no new functionality.

`v2.3.0 → v2.4.0` is a MINOR bump: new features, nothing breaking. A jump to
`v3.0.0` would signal a breaking change worth reading the notes for before
upgrading anything that talks to Hearth's API.

Each release's `notesMd` (rendered by `lib/release-notes.ts`) tags the
specific counts — 🟢 added · 🟡 modified · 🔴 breaking · 🟠 deprecated · 🐛
fixed — which is the more precise signal than the version number alone;
check those badges on `/releases` before assuming a MINOR bump has zero risk.
