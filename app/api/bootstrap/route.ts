import { handler } from "@/lib/api"
import { loadBootstrap } from "@/lib/services/bootstrap"

export const GET = handler({
  run: (_input, { user }) => loadBootstrap(user),
})
