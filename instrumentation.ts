import type { Instrumentation } from "next"

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { logError } = await import("./lib/logger")
  logError("next.request_error", error, {
    method: request.method,
    pathname: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
  })
}
