import { prisma } from "@/lib/db"
import { logError } from "@/lib/logger"
import { ensureMediaStorage } from "@/lib/media"

export const runtime = "nodejs"

export async function GET() {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, ensureMediaStorage()])
    return Response.json(
      { status: "ready", checks: { database: "ok", media: "ok" } },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    logError("health.not_ready", error)
    return Response.json(
      { status: "not_ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
