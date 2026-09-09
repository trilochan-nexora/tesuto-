import path from "node:path"
import dotenv from "dotenv"
import { defineConfig, env } from "prisma/config"

dotenv.config()

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "bun run prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
})
