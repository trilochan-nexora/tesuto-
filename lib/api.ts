import { randomUUID } from "node:crypto"
import { ZodError, type ZodTypeAny, type z } from "zod"
import { bearerFrom, getSessionUser, type SessionUser } from "./auth"
import { log, logError } from "./logger"

/** A field-level issue inside a problem response. */
export type ProblemIssue = {
  path: string
  message: string
  code?: string
}

/** RFC 9457 `application/problem+json` body. */
export type ProblemDetails = {
  type: string
  title: string
  status: number
  detail: string
  instance: string
  code: string
  requestId: string
  errors?: ProblemIssue[]
}

const TITLES: Record<number, string> = {
  400: "Bad request",
  401: "Authentication required",
  403: "Forbidden",
  404: "Not found",
  405: "Method not allowed",
  409: "Conflict",
  413: "Payload too large",
  415: "Unsupported media type",
  422: "Validation failed",
  424: "Upstream provider failed",
  429: "Too many requests",
  500: "Internal server error",
  502: "Bad gateway",
  503: "Service unavailable",
  504: "Gateway timeout",
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST"
    case 401:
      return "UNAUTHORIZED"
    case 403:
      return "FORBIDDEN"
    case 404:
      return "NOT_FOUND"
    case 409:
      return "CONFLICT"
    case 422:
      return "VALIDATION_ERROR"
    case 424:
      return "UPSTREAM_FAILED"
    case 429:
      return "RATE_LIMITED"
    case 502:
      return "BAD_GATEWAY"
    case 503:
      return "SERVICE_UNAVAILABLE"
    default:
      return status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED"
  }
}

function problemType(code: string): string {
  return `urn:tesuto:problem:${code.toLowerCase().replaceAll("_", "-")}`
}

function problemTitle(status: number): string {
  return TITLES[status] ?? "Request failed"
}

function requestIdFor(req?: Request): string {
  const incoming = req?.headers.get("x-request-id") ?? ""
  return /^[A-Za-z0-9_-]{8,128}$/.test(incoming) ? incoming : randomUUID()
}

function instanceFor(req?: Request): string {
  if (!req) return ""
  try {
    return new URL(req.url).pathname
  } catch {
    return ""
  }
}

/**
 * Serialize a failure as `application/problem+json`.
 *
 * Success bodies are returned directly (`ok`), so there is no `data`/`error`
 * envelope and no body `status` that can disagree with HTTP.
 */
export function problem(input: {
  status: number
  detail: string
  code?: string
  req?: Request
  requestId?: string
  errors?: ProblemIssue[]
  headers?: HeadersInit
}): Response {
  const requestId = input.requestId ?? requestIdFor(input.req)
  const code = input.code ?? codeForStatus(input.status)
  const body: ProblemDetails = {
    type: problemType(code),
    title: problemTitle(input.status),
    status: input.status,
    detail: input.detail,
    instance: instanceFor(input.req),
    code,
    requestId,
    ...(input.errors?.length ? { errors: input.errors } : {}),
  }

  const headers = new Headers(input.headers)
  headers.set("Content-Type", "application/problem+json")
  headers.set("X-Request-Id", requestId)

  return new Response(JSON.stringify(body), {
    status: input.status,
    headers,
  })
}

/** Return a success body directly. `init` is useful for `Set-Cookie` headers. */
export function ok<T>(data: T, init?: ResponseInit) {
  if (data === undefined) return new Response(null, init)
  return Response.json(data, init)
}

/**
 * Throw from a service to return a specific status. The route wrapper maps it
 * to a problem response; services do not build error JSON themselves.
 */
export class HttpError extends Error {
  status: number
  code?: string
  errors?: ProblemIssue[]
  /** Extra response headers, e.g. `Retry-After` on 429. */
  headers?: Record<string, string>

  constructor(
    message: string,
    status = 400,
    code?: string,
    errors?: ProblemIssue[],
  ) {
    super(message)
    this.name = "HttpError"
    this.status = status
    this.code = code
    this.errors = errors
  }
}

type RunCtx = {
  /** The signed-in user. Non-null unless the route sets `auth: false`. */
  user: SessionUser
  params: Record<string, string>
  req: Request
}

/** A 429 that tells the client exactly how long to back off. */
export function tooManyRequests(message: string, retryAfterMs: number) {
  const error = new HttpError(message, 429, "RATE_LIMITED")
  error.headers = {
    "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
  }
  return error
}

type HandlerOpts<S extends ZodTypeAny | undefined> = {
  schema?: S
  /** default true */
  auth?: boolean
  /** default false — requires `user.role === "admin"` */
  admin?: boolean
  run: (
    input: S extends ZodTypeAny ? z.infer<S> : undefined,
    ctx: RunCtx,
  ) => unknown
}

function zodIssues(error: ZodError): ProblemIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length ? issue.path.join(".") : "root",
    message: issue.message,
    code: issue.code,
  }))
}

function mapError(err: unknown, requestId: string, req: Request): Response {
  if (err instanceof ZodError) {
    return problem({
      status: 422,
      code: "VALIDATION_ERROR",
      detail: "Validation failed",
      errors: zodIssues(err),
      requestId,
      req,
    })
  }

  if (err instanceof HttpError) {
    // 5xx here means an upstream we depend on (GitHub, ClickUp) failed —
    // worth a server log, unlike a plain 4xx client mistake. Cloudflare also
    // swaps the response body for its own error page on a 5xx status, so
    // this is often the only place the real message survives.
    if (err.status >= 500) {
      logError("api.error", err, { requestId, status: err.status })
    }
    return problem({
      status: err.status,
      code: err.code ?? codeForStatus(err.status),
      detail: err.message,
      errors: err.errors,
      headers: err.headers,
      requestId,
      req,
    })
  }

  logError("api.error", err, { requestId, status: 500 })
  return problem({
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    detail: "Internal error",
    requestId,
    req,
  })
}

function requestContext(req: Request) {
  const requestId = requestIdFor(req)
  const startedAt = performance.now()
  const pathname = new URL(req.url).pathname
  const finish = (response: Response) => {
    response.headers.set("X-Request-Id", requestId)
    log("info", "api.request", {
      requestId,
      method: req.method,
      pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return response
  }
  return { requestId, finish }
}

/**
 * Thin wrapper for the `/api/widget/*` routes. No user/admin gate here —
 * `widgetAuth()` in the service does its own two-token check — just error
 * mapping, direct success bodies, and the Next 16 `params` promise. CORS comes
 * from next.config.mjs.
 */
export function widgetRoute(
  run: (req: Request, params: Record<string, string>) => unknown,
) {
  return async (
    req: Request,
    // Next 16 always calls route handlers with a context object now, even on
    // routes with no dynamic segments (params resolves to {}) — its generated
    // route-type check (.next/types) requires this param to be non-optional.
    // A default value doesn't satisfy that: TS still infers the emitted
    // function type's param as optional whenever there's a default.
    route: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const { requestId, finish } = requestContext(req)
    try {
      const params = await route.params
      const result = await run(req, params)
      return finish(result instanceof Response ? result : ok(result))
    } catch (err) {
      return finish(mapError(err, requestId, req))
    }
  }
}

/**
 * Wraps a route handler: auth + admin gate, Zod parse (query for GET/DELETE,
 * JSON body otherwise), `await`s the Next 16 `params` promise, and maps
 * ZodError → 422 / HttpError → its status / anything else → 500.
 *
 * Success bodies are returned as-is. Failures are RFC 9457 problem details.
 */
export function handler<S extends ZodTypeAny | undefined = undefined>(
  opts: HandlerOpts<S>,
) {
  return async (
    req: Request,
    // See widgetRoute() above for why this is required, not optional.
    route: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const { requestId, finish } = requestContext(req)
    try {
      const needAuth = opts.auth !== false
      const user = needAuth ? await getSessionUser(req) : null
      if (needAuth && !user) {
        return finish(
          problem({
            status: 401,
            code: "UNAUTHORIZED",
            detail: "Unauthorized",
            requestId,
            req,
          }),
        )
      }
      if (opts.admin && user?.role !== "admin") {
        return finish(
          problem({
            status: 403,
            code: "FORBIDDEN",
            detail: "Forbidden",
            requestId,
            req,
          }),
        )
      }
      // CSRF only rides on the ambient session cookie. A bearer token wins over
      // the cookie in getSessionUser, and browsers cannot attach one
      // cross-origin without CORS, so mobile WebViews (e.g. Capacitor's
      // `capacitor://localhost` Origin) are not rejected here.
      if (
        needAuth &&
        !bearerFrom(req) &&
        !["GET", "HEAD", "OPTIONS"].includes(req.method)
      ) {
        const origin = req.headers.get("origin")
        if (origin && origin !== new URL(req.url).origin) {
          return finish(
            problem({
              status: 403,
              code: "CROSS_ORIGIN_REJECTED",
              detail: "Cross-origin request rejected",
              requestId,
              req,
            }),
          )
        }
      }

      const params = await route.params

      let input: unknown
      if (opts.schema) {
        const raw =
          req.method === "GET" || req.method === "DELETE"
            ? Object.fromEntries(new URL(req.url).searchParams)
            : await req.json().catch(() => ({}))
        input = opts.schema.parse(raw)
      }

      const result = await opts.run(input as never, {
        user: user as SessionUser,
        params,
        req,
      })
      return finish(result instanceof Response ? result : ok(result))
    } catch (err) {
      return finish(mapError(err, requestId, req))
    }
  }
}
