# Bun only installs dependencies here (it understands bun.lock). The actual
# `next build` / `next start` run under real Node.js below — Next 16's
# Turbopack build spawns worker_threads with options (stdout/stderr/
# resourceLimits) Bun doesn't fully implement, which segfaults Bun on exit
# after the build itself has already finished. bun-installed node_modules
# work fine when run by plain Node.

FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `prisma generate` (part of `npm run build`) only needs DATABASE_URL to be
# resolvable, not a live connection — the real one is supplied at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
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
CMD ["npm", "run", "start"]
