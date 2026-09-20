import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { verifyLink } from "@/lib/services/widget"

/** Step 2 of linking: the code proves email ownership; signs straight in. */
export const POST = widgetRoute(async (req) => {
  const input = z
    .object({
      assertion: z.string().optional(),
      email: z.string().email(),
      code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
    })
    .parse(await req.json())
  return verifyLink(input)
})
