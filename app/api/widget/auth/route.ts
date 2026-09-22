import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import { widgetSignIn, widgetSignOut } from "@/lib/services/widget"

const SignInSchema = z.object({
  assertion: z.string().min(1).max(2_048),
})

export function OPTIONS() {
  return new Response(null, { status: 204 })
}

export const POST = widgetRoute(async (req) => {
  enforceRateLimit(req, "widget:auth", { limit: 30, windowMs: 10 * 60 * 1000 })
  const input = SignInSchema.parse(await req.json())
  return widgetSignIn(req, input)
})

export const DELETE = widgetRoute((req) => widgetSignOut(req))
