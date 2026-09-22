import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import { startLink } from "@/lib/services/widget"

/**
 * Step 1 of linking: mail a 6-digit code to the claimed Tesuto email.
 * The caller proves their host identity with the signed assertion.
 */
export const POST = widgetRoute(async (req) => {
  const input = z
    .object({
      assertion: z.string().min(1).max(2_048),
      email: z.string().trim().email().max(254),
    })
    .parse(await req.json())
  enforceRateLimit(req, "widget:link", {
    limit: 5,
    windowMs: 10 * 60 * 1000,
    key: input.email.toLowerCase(),
  })
  return startLink(input)
})
