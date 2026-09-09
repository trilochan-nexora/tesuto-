import { handler } from "@/lib/api"

export const GET = handler({
  run: (_input, { user }) => ({
    user,
    isAdmin: user.role === "admin",
    githubConnected: user.githubConnected,
  }),
})
