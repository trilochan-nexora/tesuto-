/**
 * Server-only env access. Keep all integration config in one place so a
 * missing var fails loudly (GitHub) or degrades gracefully (Slack/email).
 */

function read(name: string) {
  return process.env[name]?.trim() || ""
}

/** Production credentials fail closed on placeholders and short secrets. */
export function deploymentSecret(name: string) {
  const value = read(name)
  if (
    process.env.NODE_ENV === "production" &&
    (value.length < 32 || value.toLowerCase().startsWith("change-me"))
  ) {
    return ""
  }
  return value
}

export function requiredEnv(name: string) {
  const value = read(name)
  if (!value) throw new Error(`Missing env var ${name}`)
  return value
}

/** Where Tesuto is reachable — used for links inside Slack/email messages. */
export function appUrl() {
  return read("APP_URL") || "http://localhost:3005"
}

export function githubClientId() {
  return read("GITHUB_CLIENT_ID")
}

export function githubClientSecret() {
  return read("GITHUB_CLIENT_SECRET")
}

/** Explicit callback override; otherwise derived from the request origin. */
export function githubRedirectUri() {
  return read("GITHUB_REDIRECT_URI")
}

/** Key for encrypting GitHub OAuth tokens at rest (AES-256-GCM). */
export function appSecret() {
  return deploymentSecret("APP_SECRET")
}

export function slackWebhookUrl() {
  return read("SLACK_WEBHOOK_URL")
}

export function resendApiKey() {
  return read("RESEND_API_KEY")
}

export function emailFrom() {
  return read("EMAIL_FROM")
}

/** Optional fixed local-only login code for scripted development. */
export function authDevCode() {
  return process.env.NODE_ENV === "production" ? "" : read("AUTH_DEV_CODE")
}

/** Shared secret Hearth's CI sends as `X-Release-Secret` when posting releases. */
export function releasesWebhookSecret() {
  return deploymentSecret("HEARTH_RELEASES_SECRET")
}
