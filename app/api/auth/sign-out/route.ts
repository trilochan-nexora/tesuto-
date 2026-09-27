import { handler, ok } from "@/lib/api"
import {
  clearAppSessionCookie,
  destroySession,
  sessionTokenFrom,
} from "@/lib/auth"

export const POST = handler({
  auth: false,
  run: async (_input, { req }) => {
    await destroySession(sessionTokenFrom(req))
    return ok(
      { ok: true },
      { headers: { "Set-Cookie": clearAppSessionCookie() } },
    )
  },
})
