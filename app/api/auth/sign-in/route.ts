import { z } from "zod"
import { handler } from "@/lib/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requestSignInCode } from "@/lib/services/users"

const SignInSchema = z.object({
  email: z.string().trim().email().max(254),
})

export const POST = handler({
  schema: SignInSchema,
  auth: false,
  run: (input, { req }) => {
    enforceRateLimit(req, "auth:request", {
      limit: 5,
      windowMs: 10 * 60 * 1000,
      key: input.email.toLowerCase(),
    })
    return requestSignInCode(input)
  },
})
