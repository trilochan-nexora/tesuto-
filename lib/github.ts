import { createHmac, timingSafeEqual } from "node:crypto"
import { HttpError } from "@/lib/api"
import { githubClientId, githubClientSecret } from "@/lib/env"

/**
 * GitHub OAuth + REST wrapper. Each teammate connects their own account;
 * Tesuto keeps the board as source of truth and only performs manual,
 * per-ticket syncs (create an issue under the acting user).
 */

const API = "https://api.github.com"
const OAUTH = "https://github.com/login/oauth"

/**
 * `repo` for issue sync, `read:project` for GitHub Projects imports,
 * `read:org` because listGithubProjects()'s GraphQL query reads
 * `organizations.nodes.login` — GitHub requires that scope for the `login`
 * field on Organization even though `read:project` already covers the
 * projectsV2 data itself.
 */
export const GITHUB_SCOPES = "repo read:project read:org"

/** Callback route path on this app. */
export const GITHUB_CALLBACK_PATH = "/api/github/callback"

function stateSecret() {
  const secret = process.env.APP_SECRET?.trim()
  if (!secret) throw new Error("Missing env var APP_SECRET")
  return secret
}

/**
 * CSRF-safe OAuth state: `payload.signature` where the signature is an HMAC
 * over the payload. Carries the Tesuto user id across the browser round-trip
 * without a cookie or server-side store.
 */
export function signOAuthState(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, t: Date.now() }),
  ).toString("base64url")
  const sig = createHmac("sha256", stateSecret())
    .update(payload)
    .digest("base64url")
  return `${payload}.${sig}`
}

export function verifyOAuthState(state: unknown): { userId: string } | null {
  if (typeof state !== "string" || !state.includes(".")) return null
  const [payload, sig] = state.split(".")
  const expected = createHmac("sha256", stateSecret())
    .update(payload)
    .digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { u?: string; t?: number }
    if (!data.u || typeof data.t !== "number") return null
    // States are single-use and short-lived: 10 minutes.
    if (Date.now() - data.t > 10 * 60 * 1000) return null
    return { userId: data.u }
  } catch {
    return null
  }
}

export function authUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: githubClientId(),
    redirect_uri: redirectUri,
    scope: GITHUB_SCOPES,
    state,
  })
  return `${OAUTH}/authorize?${params}`
}

export function callbackUrl(origin: string) {
  return `${origin}${GITHUB_CALLBACK_PATH}`
}

type JsonObject = Record<string, unknown>

async function githubFetch(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: JsonObject | null }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "tesuto",
      "x-github-api-version": "2022-11-28",
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
  let body: JsonObject | null = null
  try {
    body = (await res.json()) as JsonObject
  } catch {}
  return { ok: res.ok, status: res.status, body }
}

function githubMessage(body: JsonObject | null) {
  return typeof body?.message === "string" ? body.message : "unknown error"
}

/** `POST /login/oauth/access_token` → access token, or a thrown HttpError. */
export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${OAUTH}/access_token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "tesuto",
    },
    body: JSON.stringify({
      client_id: githubClientId(),
      client_secret: githubClientSecret(),
      code,
    }),
  })
  const body = (await res.json().catch(() => null)) as JsonObject | null
  const token = typeof body?.access_token === "string" ? body.access_token : ""
  if (!res.ok || !token) {
    const message =
      (typeof body?.error_description === "string"
        ? body.error_description
        : "") ||
      (typeof body?.error === "string" ? body.error : "") ||
      `GitHub rejected the code (${res.status})`
    throw new HttpError(message, 502)
  }
  return token
}

export async function fetchGithubUser(token: string): Promise<{
  login: string
  name: string
  id: number
}> {
  const { ok, status, body } = await githubFetch("/user", token)
  const login = typeof body?.login === "string" ? body.login : ""
  const name = typeof body?.name === "string" && body.name ? body.name : login
  const id = typeof body?.id === "number" ? body.id : 0
  if (!ok || !login) {
    throw new HttpError(
      `GitHub lookup failed (${status}): ${githubMessage(body)}`,
      502,
    )
  }
  return { login, name, id }
}

export type GithubIssueInput = {
  token: string
  repo: string
  title: string
  body: string
}

/** Creates an issue in `owner/repo` using the caller's own token. */
export async function createGithubIssue(
  input: GithubIssueInput,
): Promise<{ htmlUrl: string; number: number }> {
  const { ok, status, body } = await githubFetch(
    `/repos/${input.repo}/issues`,
    input.token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: input.title, body: input.body }),
    },
  )
  if (!ok) {
    const hint =
      status === 403
        ? " (token scope or org access denied — disconnect and reconnect)"
        : status === 404
          ? " (repo not found or token lacks access)"
          : ""
    throw new HttpError(
      `GitHub issue creation failed (${status}): ${githubMessage(body)}${hint}`,
      502,
    )
  }
  const htmlUrl = typeof body?.html_url === "string" ? body.html_url : ""
  const number = typeof body?.number === "number" ? body.number : 0
  return { htmlUrl, number }
}
