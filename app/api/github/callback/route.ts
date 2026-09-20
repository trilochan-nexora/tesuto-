import { appUrl } from "@/lib/env"
import { exchangeCode, fetchGithubUser, verifyOAuthState } from "@/lib/github"
import { linkGithubAccount } from "@/lib/services/users"

function redirect(path: string) {
  return Response.redirect(new URL(path, appUrl()), 302)
}

/**
 * Step 2 of the GitHub OAuth flow. No Tesuto session here — the OAuth `state`
 * carries the signing user's id (HMAC-signed, 10-minute expiry). On success
 * the (encrypted) token is stored and the browser lands back on Settings.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code") ?? ""
  const state = url.searchParams.get("state")
  const denied = url.searchParams.get("error")

  const info = verifyOAuthState(state)
  if (!info) return redirect("/settings?github=invalid_state")
  if (denied) return redirect("/settings?github=cancelled")

  try {
    const token = await exchangeCode(code)
    const profile = await fetchGithubUser(token)
    await linkGithubAccount(info.userId, {
      login: profile.login,
      token,
    })
    return redirect(
      `/settings?github=connected&login=${encodeURIComponent(profile.login)}`,
    )
  } catch (err) {
    console.error("[github:callback]", err)
    const message = err instanceof Error ? err.message : "connection failed"
    return redirect(`/settings?github=error&msg=${encodeURIComponent(message)}`)
  }
}
