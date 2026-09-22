type LogLevel = "info" | "warn" | "error"

function errorFields(error: unknown) {
  if (!(error instanceof Error)) return { error: String(error) }
  return {
    error: error.message,
    errorName: error.name,
    ...(process.env.NODE_ENV === "development" && error.stack
      ? { stack: error.stack }
      : {}),
  }
}

/** Structured logs that stay useful in containers without leaking request data. */
export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  })
  if (level === "error") console.error(entry)
  else if (level === "warn") console.warn(entry)
  else console.info(entry)
}

export function logError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
) {
  log("error", event, { ...fields, ...errorFields(error) })
}
