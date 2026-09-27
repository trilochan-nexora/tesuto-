import { handler, HttpError } from "@/lib/api"
import { signAssertion } from "@/lib/assertion"
import { widgetSecret } from "@/lib/services/widget"

/**
 * The in-app widget playground is itself a trusted host. It may exchange the
 * current dashboard session for the same short-lived assertion external hosts
 * mint on their own servers.
 */
export const GET = handler({
  run: (_input, { user }) => {
    const secret = widgetSecret()
    if (!secret) {
      throw new HttpError("Widget identity verification is not configured", 503)
    }
    return {
      assertion: signAssertion(
        {
          email: user.email,
          name: user.name,
          exp: Math.floor(Date.now() / 1000) + 4 * 60,
        },
        secret,
      ),
    }
  },
})
