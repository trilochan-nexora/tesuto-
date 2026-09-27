import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import { verifyLink } from "@/lib/services/widget"

/** Step 2 of linking: the code proves email ownership; signs straight in. */
export const POST = widgetRoute(async (req) => {
  const input = z
    .object({
      assertion: z.string().min(1).max(2_048),
      email: z.string().trim().email().max(254),
      code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
    })
    .parse(await req.json())
  enforceRateLimit(req, "widget:verify", {
    limit: 10,
    windowMs: 10 * 60 * 1000,
    key: input.email.toLowerCase(),
  })
  return verifyLink(input)
})
