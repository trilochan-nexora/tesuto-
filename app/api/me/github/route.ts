import { handler } from "@/lib/api"
import { publicUser, unlinkGithubAccount } from "@/lib/services/users"

/**
 * Disconnecting clears the encrypted token, the known login, and the flag —
 * syncs fail with "connect your account" until the user re-links.
 */
export const DELETE = handler({
  run: async (_input, { user }) =>
    publicUser(await unlinkGithubAccount(user.id)),
})
