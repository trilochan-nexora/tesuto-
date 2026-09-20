import { handler } from "@/lib/api"
import { publicUser } from "@/lib/services/users"

export const GET = handler({
  run: (_input, { user }) => ({
    user: publicUser(user),
    isAdmin: user.role === "admin",
    githubConnected: user.githubConnected,
  }),
})
