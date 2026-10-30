import { timingSafeEqual } from "node:crypto"
import { problem } from "@/lib/api"
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
    return problem({
      status: 401,
      code: "UNAUTHORIZED",
      detail: "Unauthorized",
      req,
    })
  }
  try {
    return Response.json(await runMaintenance())
  } catch (error) {
    logError("maintenance.failed", error)
    return problem({
      status: 500,
      code: "MAINTENANCE_FAILED",
      detail: "Maintenance failed",
      req,
    })
  }
}
