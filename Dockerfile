FROM oven/bun:1.3.14-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder
COPY . .
# `prisma generate` (part of the build) only needs DATABASE_URL to be
# resolvable, not a live connection — the real one is supplied at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
# --webpack: Next 16 defaults `next build` to Turbopack, whose worker pool
# passes worker_threads options (stdout/stderr/resourceLimits) Bun doesn't
# implement — that corrupts page-data collection and segfaults Bun on exit.
# Webpack's build path doesn't hit this. (`next start` at runtime is
# unaffected either way — it doesn't spawn build workers.)
RUN bunx prisma generate && bunx next build --webpack

FROM oven/bun:1.3.14-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/.next ./.next
COPY --from=builder --chown=bun:bun /app/public ./public
COPY --from=builder --chown=bun:bun /app/package.json ./package.json
COPY --from=builder --chown=bun:bun /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=bun:bun /app/prisma ./prisma
COPY --from=builder --chown=bun:bun /app/prisma.config.ts ./prisma.config.ts
COPY --chown=bun:bun docker-entrypoint.sh ./docker-entrypoint.sh

USER bun
EXPOSE 3005
ENV PORT=3005

# Applies pending migrations against the internal Postgres service (same
# Dokploy project/network) before starting, so the DB is never exposed
# publicly just to run migrations.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "run", "start"]
