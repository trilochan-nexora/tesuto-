import { handler } from "@/lib/api"
import { setGithubConnected } from "@/lib/services/users"

export const POST = handler({
  run: (_input, { user }) => setGithubConnected(user.id, true),
})

export const DELETE = handler({
  run: (_input, { user }) => setGithubConnected(user.id, false),
})
