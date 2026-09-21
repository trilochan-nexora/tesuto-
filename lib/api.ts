import { ZodError, type ZodTypeAny, type z } from "zod"
import { getSessionUser, type SessionUser } from "./auth"

/** Every API route answers with this envelope. `error` is null on success. */
export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ data, error: null }, init)
}

export function fail(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return Response.json({ data: null, error: { message, ...extra } }, { status })
}

/** Throw from a service to return a specific status through the envelope. */
export class HttpError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

type RunCtx = {
  /** The signed-in user. Non-null unless the route sets `auth: false`. */
  user: SessionUser
  params: Record<string, string>
  req: Request
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

function mapError(err: unknown): Response {
  if (err instanceof ZodError) {
    return fail("Validation failed", 422, { issues: err.issues })
  }
  if (err instanceof HttpError) {
    // 5xx here means an upstream we depend on (GitHub, ClickUp) failed —
    // worth a server log, unlike a plain 4xx client mistake. Cloudflare also
    // swaps the response body for its own error page on a 5xx status, so
    // this is often the only place the real message survives.
    if (err.status >= 500) console.error("[api]", err.status, err.message)
    return fail(err.message, err.status)
  }
  console.error("[api]", err)
  return fail("Internal error", 500)
}

/**
 * Thin wrapper for the `/api/widget/*` routes. No user/admin gate here —
 * `widgetAuth()` in the service does its own two-token check — just envelope +
 * error mapping + the Next 16 `params` promise. CORS comes from next.config.mjs.
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
    try {
      const params = await route.params
      return ok(await run(req, params))
    } catch (err) {
      return mapError(err)
    }
  }
}

/**
 * Wraps a route handler: auth + admin gate, Zod parse (query for GET/DELETE,
 * JSON body otherwise), `await`s the Next 16 `params` promise, and maps
 * ZodError → 422 / HttpError → its status / anything else → 500.
 */
export function handler<S extends ZodTypeAny | undefined = undefined>(
  opts: HandlerOpts<S>,
) {
  return async (
    req: Request,
    // See widgetRoute() above for why this is required, not optional.
    route: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    try {
      const needAuth = opts.auth !== false
      const user = needAuth ? await getSessionUser(req) : null
      if (needAuth && !user) return fail("Unauthorized", 401)
      if (opts.admin && user?.role !== "admin") return fail("Forbidden", 403)

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
      return ok(result)
    } catch (err) {
      return mapError(err)
    }
  }
}
