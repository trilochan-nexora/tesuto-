export const TOKEN_KEY = "tesuto:token"

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export function getToken() {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
export function setToken(token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch {}
}
export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401) {
    clearToken()
    onUnauthorized?.()
    throw new ApiError("Unauthorized", 401)
  }
  let json: { data?: T; error?: { message?: string } | null } = {}
  try {
    json = await res.json()
  } catch {}
  if (!res.ok || json.error) {
    throw new ApiError(
      json.error?.message ?? `Request failed (${res.status})`,
      res.status,
    )
  }
  return json.data as T
}

/** Drops `null`s so API rows line up with the client's optional (`?:`) types. */
export function stripNull<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, v) =>
    v === null ? undefined : v,
  ) as T
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
}
