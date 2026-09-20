import { HttpError, handler } from "@/lib/api"
import { appSecret, githubClientId, githubRedirectUri } from "@/lib/env"
import { authUrl, callbackUrl, signOAuthState } from "@/lib/github"

/**
 * Step 1 of the GitHub OAuth flow. Requires the caller's Tesuto session
 * (bearer token) and answers with the GitHub authorize URL — the client
 * navigates there, GitHub sends the user to `/api/github/callback`.
 */
export const GET = handler({
  run: (_input, { user, req }) => {
    if (!githubClientId()) {
      throw new HttpError(
        "GitHub OAuth is not configured (missing GITHUB_CLIENT_ID)",
        500,
      )
    }
    if (!appSecret()) {
      throw new HttpError(
        "GitHub OAuth is not configured (missing APP_SECRET)",
        500,
      )
    }
    const origin = new URL(req.url).origin
    const redirectUri = githubRedirectUri() || callbackUrl(origin)
    const state = signOAuthState(user.id)
    return { url: authUrl(state, redirectUri) }
  },
})
