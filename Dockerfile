FROM oven/bun:1.3.14 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder
COPY . .
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
