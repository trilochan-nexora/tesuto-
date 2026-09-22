let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
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
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20_000)
  const abort = () => controller.abort()
  init.signal?.addEventListener("abort", abort, { once: true })
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      signal: controller.signal,
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    })
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new ApiError("The server took too long to respond", 408)
    }
    if (error instanceof TypeError) {
      throw new ApiError("Can't reach the server. Check your connection.", 0)
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    init.signal?.removeEventListener("abort", abort)
  }
  if (res.status === 401) {
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
