import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { startLink } from "@/lib/services/widget"

/**
 * Step 1 of linking: mail a 6-digit code to the claimed Tesuto email.
 * The caller proves their host identity with the signed assertion.
 */
export const POST = widgetRoute(async (req) => {
  const input = z
    .object({
      assertion: z.string().optional(),
      email: z.string().email(),
    })
    .parse(await req.json())
  return startLink(input)
})
