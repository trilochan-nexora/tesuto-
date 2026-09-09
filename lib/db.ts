import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { PrismaClient } from "@/prisma/generated/client"

// Single Prisma client + pg Pool for the whole process. Cached on `globalThis`
// in dev so Next's HMR reloads don't leak a new Pool on every edit (which
// exhausts Postgres connections).
const globalForDb = globalThis as unknown as {
  __tesutoPool?: Pool
  __tesutoPrisma?: PrismaClient
}

const pool =
  globalForDb.__tesutoPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  })

export const prisma =
  globalForDb.__tesutoPrisma ??
  new PrismaClient({ adapter: new PrismaPg(pool) })

if (process.env.NODE_ENV !== "production") {
  globalForDb.__tesutoPool = pool
  globalForDb.__tesutoPrisma = prisma
}
