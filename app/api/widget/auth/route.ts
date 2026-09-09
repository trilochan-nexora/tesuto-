import { z } from "zod"
import { widgetRoute } from "@/lib/api"
import { widgetSignIn, widgetSignOut } from "@/lib/services/widget"

const SignInSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
})

export function OPTIONS() {
  return new Response(null, { status: 204 })
}

export const POST = widgetRoute(async (req) => {
  const input = SignInSchema.parse(await req.json())
  return widgetSignIn(req, input)
})

export const DELETE = widgetRoute((req) => widgetSignOut(req))
