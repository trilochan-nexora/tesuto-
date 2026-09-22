import { timingSafeEqual } from "node:crypto"
import { deploymentSecret } from "@/lib/env"
import { logError } from "@/lib/logger"
import { runMaintenance } from "@/lib/maintenance"

export const runtime = "nodejs"

function authorized(req: Request) {
  const secret = deploymentSecret("MAINTENANCE_SECRET")
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!secret || !supplied) return false
  const expected = Buffer.from(secret)
  const actual = Buffer.from(supplied)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return Response.json(
      { data: null, error: { message: "Unauthorized" } },
      { status: 401 },
    )
  }
  try {
    return Response.json({ data: await runMaintenance(), error: null })
  } catch (error) {
    logError("maintenance.failed", error)
    return Response.json(
      { data: null, error: { message: "Maintenance failed" } },
      { status: 500 },
    )
  }
}
