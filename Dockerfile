# Pinned to a floating minor tag (not the exact 1.3.14 from package.json)
# because 1.3.14 segfaults in bun's worker-thread cleanup after `next build`
# finishes inside Docker's buildx sandbox — a bun engine bug, not app code.
FROM oven/bun:1.2 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder
COPY . .
# `prisma generate` (part of `bun run build`) only needs DATABASE_URL to be
# resolvable, not a live connection — the real one is supplied at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh

EXPOSE 3005
ENV PORT=3005

# Applies pending migrations against the internal Postgres service (same
# Dokploy project/network) before starting, so the DB is never exposed
# publicly just to run migrations.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "run", "start"]
