import { handler } from "@/lib/api"
import { bearerFrom, destroySession } from "@/lib/auth"

export const POST = handler({
  auth: false,
  run: async (_input, { req }) => {
    await destroySession(bearerFrom(req))
    return { ok: true }
  },
})
