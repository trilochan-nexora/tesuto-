import { z } from "zod"
import { handler, ok } from "@/lib/api"
import { appSessionCookie } from "@/lib/auth"
import { enforceRateLimit } from "@/lib/rate-limit"
import { verifySignInCode } from "@/lib/services/users"

const VerifySchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
})

export const POST = handler({
  schema: VerifySchema,
  auth: false,
  run: async (input, { req }) => {
    enforceRateLimit(req, "auth:verify", {
      limit: 10,
      windowMs: 10 * 60 * 1000,
      key: input.email.toLowerCase(),
    })
    const { user, session } = await verifySignInCode(input)
    return ok(
      { user },
      { headers: { "Set-Cookie": appSessionCookie(session.token, session.expiresAt) } },
    )
  },
})
