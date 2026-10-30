let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

type ProblemIssue = {
  path: string
  message: string
  code?: string
}

type ProblemDetails = {
  title?: string
  detail?: string
  code?: string
  requestId?: string
  errors?: ProblemIssue[]
}

export class ApiError extends Error {
  status: number
  code?: string
  requestId?: string
  issues?: ProblemIssue[]

  constructor(
    message: string,
    status: number,
    options: {
      code?: string
      requestId?: string
      issues?: ProblemIssue[]
    } = {},
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = options.code
    this.requestId = options.requestId
    this.issues = options.issues
  }
}

function isProblem(value: unknown): value is ProblemDetails {
  return (
    typeof value === "object" &&
    value !== null &&
    ("detail" in value || "title" in value || "code" in value)
  )
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

  const text = await res.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (res.status === 401) {
    onUnauthorized?.()
  }

  if (!res.ok) {
    const failure = isProblem(payload) ? payload : null
    const fallback =
      typeof payload === "string" && payload.length > 0
        ? payload
        : `Request failed (${res.status})`
    throw new ApiError(
      failure?.detail ?? failure?.title ?? fallback,
      res.status,
      {
        code: failure?.code,
        requestId: failure?.requestId,
        issues: failure?.errors,
      },
    )
  }

  return payload as T
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
