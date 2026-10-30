/**
 * Tesuto's OpenAPI 3.1 description.
 *
 * This module is the single source of truth for:
 *   - GET /swagger/json (machine-readable JSON)
 *   - /swagger          (Swagger UI)
 *   - scripts/openapi-check.ts (coverage + structure check)
 *
 * Keep it dependency-free. The routes are still validated by Zod at runtime,
 * so this describes the same contract for clients rather than generating it.
 */

type JsonSchema = Record<string, unknown>
type SecurityRequirement = Record<string, string[]>

export type ApiParameter = {
  name: string
  in: "query" | "header" | "path" | "cookie"
  required?: boolean
  description?: string
  schema?: JsonSchema
  example?: unknown
}

type MediaTypeObject = {
  schema?: JsonSchema
  example?: unknown
}

export type ApiRequestBody = {
  required?: boolean
  description?: string
  content: Record<string, MediaTypeObject>
}

export type ApiResponseObject = {
  description: string
  headers?: Record<string, JsonSchema>
  content?: Record<string, MediaTypeObject>
}

export type ApiResponse = ApiResponseObject | { $ref: string }

export type ApiOperation = {
  tags: string[]
  summary: string
  description?: string
  operationId: string
  security?: SecurityRequirement[]
  parameters?: ApiParameter[]
  requestBody?: ApiRequestBody
  responses: Record<string, ApiResponse>
}

export type ApiTag = {
  name: string
  description: string
}

export type OpenApiSpec = {
  openapi: string
  info: {
    title: string
    version: string
    description: string
    license?: { name: string }
  }
  servers: { url: string; description: string }[]
  tags: ApiTag[]
  paths: Record<string, Record<string, ApiOperation>>
  components: {
    securitySchemes: Record<string, JsonSchema>
    schemas: Record<string, JsonSchema>
    headers: Record<string, JsonSchema>
  }
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

const ref = (name: string): JsonSchema => ({
  $ref: `#/components/schemas/${name}`,
})

const arrayOf = (schema: JsonSchema): JsonSchema => ({
  type: "array",
  items: schema,
})

const nullable = (schema: JsonSchema): JsonSchema => ({
  anyOf: [schema, { type: "null" }],
})

const stringOrNull = (): JsonSchema => ({ type: ["string", "null"] })

const dateTime = (): JsonSchema => ({
  type: "string",
  format: "date-time",
  examples: ["2026-10-26T09:45:00.000Z"],
})

const id = (): JsonSchema => ({
  type: "string",
  examples: ["cmtuf5v1z000fpn9yzy9wgr39"],
  description: "Opaque Tesuto id (cuid or a seeded demo id).",
})

/**
 * Success bodies are returned directly. `ok()` is kept as a named constructor
 * so operations read as `ok(ref("Ticket"))` rather than a bare schema, but it
 * deliberately adds no wrapper.
 */
const ok = (data: JsonSchema): JsonSchema => data

const json = (schema: JsonSchema, description: string): ApiResponseObject => ({
  description,
  headers: { "X-Request-Id": { $ref: "#/components/headers/XRequestId" } },
  content: { "application/json": { schema } },
})

const PROBLEM_META: Record<
  number,
  { code: string; title: string; detail: string }
> = {
  400: {
    code: "BAD_REQUEST",
    title: "Bad request",
    detail: "Malformed request",
  },
  401: {
    code: "UNAUTHORIZED",
    title: "Authentication required",
    detail: "Unauthorized",
  },
  403: { code: "FORBIDDEN", title: "Forbidden", detail: "Forbidden" },
  404: { code: "NOT_FOUND", title: "Not found", detail: "Not found" },
  409: { code: "CONFLICT", title: "Conflict", detail: "Conflict" },
  416: {
    code: "RANGE_NOT_SATISFIABLE",
    title: "Range not satisfiable",
    detail: "Invalid range",
  },
  422: {
    code: "VALIDATION_ERROR",
    title: "Validation failed",
    detail: "Validation failed",
  },
  429: {
    code: "RATE_LIMITED",
    title: "Too many requests",
    detail: "Too many requests",
  },
  500: {
    code: "INTERNAL_SERVER_ERROR",
    title: "Internal server error",
    detail: "Internal error",
  },
  424: {
    code: "UPSTREAM_FAILED",
    title: "Upstream provider failed",
    detail: "Upstream request failed",
  },
  502: {
    code: "BAD_GATEWAY",
    title: "Bad gateway",
    detail: "Upstream request failed",
  },
  503: {
    code: "SERVICE_UNAVAILABLE",
    title: "Service unavailable",
    detail: "Service unavailable",
  },
}

function problemMeta(status: number) {
  return (
    PROBLEM_META[status] ?? {
      code: status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED",
      title: status >= 500 ? "Internal server error" : "Request failed",
      detail: "Request failed",
    }
  )
}

const problemExample = (status: number) => {
  const meta = problemMeta(status)
  return {
    type: `urn:tesuto:problem:${meta.code.toLowerCase().replaceAll("_", "-")}`,
    title: meta.title,
    status,
    detail: meta.detail,
    instance: "/api/tickets",
    code: meta.code,
    requestId: "3f0c1f7e-5b0f-4f5e-9a0e-6a7f0b2c9d41",
    ...(status === 422
      ? {
          errors: [
            { path: "title", message: "Required", code: "invalid_type" },
          ],
        }
      : {}),
  }
}

/**
 * Every error response carries its own `application/problem+json` schema and a
 * status-appropriate example. Reusing one component response would make the
 * raw spec show only a `$ref` at each operation, which looks like a missing
 * schema to spec readers and to tools that do not resolve response references.
 */
const problemJson = (
  status: number,
  description: string,
): ApiResponseObject => ({
  description,
  headers: { "X-Request-Id": { $ref: "#/components/headers/XRequestId" } },
  content: {
    "application/problem+json": {
      schema: ref("ProblemDetails"),
      example: problemExample(status),
    },
  },
})

/** Adds response headers on top of the X-Request-Id every response carries. */
const withHeaders = (
  response: ApiResponseObject,
  headers: Record<string, JsonSchema>,
): ApiResponseObject => ({
  ...response,
  headers: { ...response.headers, ...headers },
})

const jsonBody = (
  schema: JsonSchema,
  options: { description?: string; example?: unknown; required?: boolean } = {},
): ApiRequestBody => ({
  required: options.required ?? true,
  ...(options.description ? { description: options.description } : {}),
  content: {
    "application/json": {
      schema,
      ...(options.example !== undefined ? { example: options.example } : {}),
    },
  },
})

const p = (name: string, description?: string): ApiParameter => ({
  name,
  in: "path",
  required: true,
  ...(description ? { description } : {}),
  schema: { type: "string" },
})

const q = (
  name: string,
  description: string,
  schema: JsonSchema = { type: "string" },
  required = false,
): ApiParameter => ({
  name,
  in: "query",
  required,
  description,
  schema,
})

const h = (
  name: string,
  description: string,
  schema: JsonSchema = { type: "string" },
  required = false,
): ApiParameter => ({
  name,
  in: "header",
  required,
  description,
  schema,
})

/* -------------------------------------------------------------------------- */
/* security                                                                   */
/* -------------------------------------------------------------------------- */

const appAuth: SecurityRequirement[] = [{ appBearer: [] }, { appCookie: [] }]
const widgetAuth: SecurityRequirement[] = [
  { projectToken: [], widgetBearer: [] },
]
const projectAuth: SecurityRequirement[] = [{ projectToken: [] }]
const publicAuth: SecurityRequirement[] = []

/** Reused error responses. */
const errors = {
  400: problemJson(400, "Malformed request."),
  401: problemJson(
    401,
    "Missing, invalid, expired, or wrong-scope credentials.",
  ),
  403: problemJson(
    403,
    "Authenticated, but not allowed (admin-only route, cross-origin mutation, or disabled integration).",
  ),
  404: problemJson(404, "The requested resource does not exist."),
  409: problemJson(409, "The request conflicts with current state."),
  422: problemJson(
    422,
    "Zod validation failed. `errors` describes every invalid field.",
  ),
  429: withHeaders(
    problemJson(
      429,
      "Too many requests. Rate limits are per-process and per-IP (plus an email or route namespace where noted). Wait `Retry-After` seconds before retrying.",
    ),
    {
      "Retry-After": {
        description: "Seconds until the limit resets.",
        schema: { type: "integer", minimum: 1 },
      },
    },
  ),
  500: problemJson(
    500,
    "Unexpected server error. The response carries `X-Request-Id`; include it when reporting the problem.",
  ),
  424: problemJson(
    424,
    "An upstream provider (GitHub or ClickUp) failed. `detail` may include the provider's reason. (Not 502, which Cloudflare replaces with its own error page.)",
  ),
  503: problemJson(
    503,
    "A required dependency is not configured or is temporarily unavailable.",
  ),
} as const

/* -------------------------------------------------------------------------- */
/* schemas                                                                    */
/* -------------------------------------------------------------------------- */

const schemas: Record<string, JsonSchema> = {
  ProblemIssue: {
    type: "object",
    required: ["path", "message"],
    properties: {
      path: {
        type: "string",
        description: "Dot-separated field path, or `root`.",
        examples: ["title"],
      },
      message: { type: "string", examples: ["Required"] },
      code: {
        type: "string",
        description: "Machine-readable issue code from Zod.",
        examples: ["invalid_type"],
      },
    },
  },
  ProblemDetails: {
    type: "object",
    required: [
      "type",
      "title",
      "status",
      "detail",
      "instance",
      "code",
      "requestId",
    ],
    properties: {
      type: {
        type: "string",
        format: "uri",
        description: "Stable problem type identifier.",
      },
      title: {
        type: "string",
        description: "Human-readable summary for this problem class.",
      },
      status: {
        type: "integer",
        description: "Mirrors the HTTP status; HTTP is authoritative.",
      },
      detail: {
        type: "string",
        description: "Human-readable explanation for this occurrence.",
      },
      instance: {
        type: "string",
        description: "Request path.",
      },
      code: {
        type: "string",
        description: "Stable machine-readable error code.",
      },
      requestId: {
        type: "string",
        description: "Correlation id, also returned as `X-Request-Id`.",
      },
      errors: {
        type: "array",
        description: "Field-level issues, when applicable.",
        items: ref("ProblemIssue"),
      },
    },
  },
  MediaAttachment: {
    type: "object",
    required: ["id", "name", "kind", "mimeType", "size", "url"],
    properties: {
      id: { type: "string" },
      name: { type: "string", examples: ["screenshot.png"] },
      kind: { type: "string", enum: ["voice", "attachment"] },
      mimeType: { type: "string", examples: ["image/png"] },
      size: { type: "integer", examples: [184320] },
      url: {
        type: "string",
        description:
          "Media URL. Widget responses sign it for 15 minutes; app responses return the protected /api/media/{id} path and rely on the session cookie.",
        examples: [
          "https://tesuto.example.com/api/media/abc123?expires=1761550000&signature=…",
        ],
      },
    },
  },
  AttachmentInput: {
    type: "object",
    required: ["name", "data"],
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        examples: ["console.log"],
      },
      data: {
        type: "string",
        maxLength: 7_000_000,
        description:
          "Base64 data URL. The decoded file must be ≤ 5 MB and use one of the allowed image/video/audio/pdf/json/zip/office/text MIME types.",
        pattern:
          "^data:(?:image/(?:png|jpeg|webp|gif)|video/(?:webm|mp4)|audio/(?:webm|mp4|mpeg|ogg|wav)|application/(?:pdf|json|zip|msword|vnd\\.openxmlformats-officedocument\\.(?:wordprocessingml\\.document|spreadsheetml\\.sheet)|vnd\\.ms-excel)|text/(?:plain|csv));base64,[A-Za-z0-9+/=]+$",
      },
    },
  },
  Annotation: {
    type: "object",
    required: ["id", "kind", "x", "y", "w", "h", "color"],
    properties: {
      id: { type: "string", maxLength: 128 },
      kind: { type: "string", enum: ["box", "arrow", "pin"] },
      x: { type: "number" },
      y: { type: "number" },
      w: { type: "number" },
      h: { type: "number" },
      color: { type: "string", maxLength: 32 },
      label: { type: "string", maxLength: 200 },
    },
  },
  DomSnapshot: {
    type: "object",
    required: ["selector", "tag"],
    properties: {
      selector: { type: "string", maxLength: 2_000 },
      tag: { type: "string", maxLength: 100 },
      text: { type: "string", maxLength: 5_000 },
      rect: {
        type: "object",
        required: ["width", "height"],
        properties: {
          width: { type: "number", minimum: 0, maximum: 100_000 },
          height: { type: "number", minimum: 0, maximum: 100_000 },
        },
      },
      x: { type: "number", minimum: 0, maximum: 1 },
      y: { type: "number", minimum: 0, maximum: 1 },
      view: {
        type: "object",
        maxProperties: 50,
        additionalProperties: { type: "number" },
      },
    },
  },
  ReproStep: {
    type: "object",
    required: ["kind", "at"],
    properties: {
      kind: { type: "string", enum: ["click", "nav"] },
      at: { type: "string", maxLength: 40 },
      target: { type: "string", maxLength: 300 },
      text: { type: "string", maxLength: 120 },
      url: { type: "string", maxLength: 300 },
    },
  },
  TicketContext: {
    type: "object",
    properties: {
      sessionId: { type: "string", maxLength: 128 },
      browser: { type: "string", maxLength: 200 },
      os: { type: "string", maxLength: 200 },
      viewport: { type: "string", maxLength: 100, examples: ["390×844"] },
      consoleErrors: {
        type: "array",
        maxItems: 20,
        items: { type: "string", maxLength: 500 },
      },
      failedRequests: {
        type: "array",
        maxItems: 20,
        items: { type: "string", maxLength: 500 },
      },
      steps: {
        type: "array",
        maxItems: 30,
        items: ref("ReproStep"),
      },
    },
  },
  TicketEvent: {
    type: "object",
    required: ["at", "kind"],
    properties: {
      at: dateTime(),
      kind: {
        type: "string",
        enum: ["created", "assigned", "unassigned", "status", "synced"],
      },
      actorId: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
    },
  },
  User: {
    type: "object",
    required: ["id", "name", "email", "color", "role", "active"],
    properties: {
      id: id(),
      name: { type: "string", examples: ["Ava Chen"] },
      email: { type: "string", format: "email" },
      color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      githubLogin: stringOrNull(),
      role: { type: "string", enum: ["admin", "member"] },
      title: stringOrNull(),
      bio: stringOrNull(),
      active: { type: "boolean" },
      githubConnected: { type: "boolean" },
      notificationsSeenAt: nullable(dateTime()),
      createdAt: dateTime(),
      updatedAt: dateTime(),
    },
  },
  Project: {
    type: "object",
    required: [
      "id",
      "key",
      "name",
      "description",
      "color",
      "token",
      "createdAt",
    ],
    properties: {
      id: id(),
      key: { type: "string", examples: ["SAND"] },
      name: { type: "string", examples: ["Sandbox"] },
      description: { type: "string" },
      color: { type: "string" },
      token: {
        type: "string",
        description:
          "Publishable project token (`tsto_pk_…`). Safe to embed in client code; it identifies the board, not a user. Never treat it as an app session.",
        examples: ["tsto_pk_tesuto_7e1a9046cb"],
      },
      githubRepo: stringOrNull(),
      createdAt: dateTime(),
    },
  },
  Column: {
    type: "object",
    required: ["id", "projectId", "label", "dot", "terminal", "order"],
    properties: {
      id: { type: "string", examples: ["in_progress"] },
      projectId: { type: "string" },
      label: { type: "string", examples: ["In Progress"] },
      description: stringOrNull(),
      dot: { type: "string", examples: ["bg-amber-500"] },
      terminal: { type: "boolean" },
      limit: nullable({ type: "integer" }),
      order: { type: "integer" },
    },
  },
  Ticket: {
    type: "object",
    required: [
      "id",
      "key",
      "projectId",
      "title",
      "status",
      "priority",
      "type",
      "reporterId",
      "order",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      id: id(),
      key: { type: "string", examples: ["SAND-12"] },
      projectId: { type: "string" },
      title: { type: "string" },
      description: stringOrNull(),
      status: {
        type: "string",
        description:
          "A column id for the project. Defaults are backlog, todo, in_progress, review, done; projects can add their own.",
        examples: ["in_progress"],
      },
      priority: ref("Priority"),
      type: ref("IssueType"),
      reporterId: { type: "string" },
      assigneeId: stringOrNull(),
      sourceUrl: stringOrNull(),
      domSnapshot: nullable(ref("DomSnapshot")),
      screenshotUrl: stringOrNull(),
      recordingUrl: stringOrNull(),
      attachments: arrayOf(ref("MediaAttachment")),
      annotations: arrayOf(ref("Annotation")),
      context: nullable(ref("TicketContext")),
      githubIssueUrl: stringOrNull(),
      commentCount: { type: "integer" },
      order: { type: "number" },
      parentId: stringOrNull(),
      assignedAt: nullable(dateTime()),
      resolvedAt: nullable(dateTime()),
      events: arrayOf(ref("TicketEvent")),
      createdAt: dateTime(),
      updatedAt: dateTime(),
    },
  },
  Comment: {
    type: "object",
    required: ["id", "ticketId", "authorId", "body", "createdAt"],
    properties: {
      id: id(),
      ticketId: { type: "string" },
      authorId: { type: "string" },
      body: { type: "string" },
      attachments: arrayOf(ref("MediaAttachment")),
      createdAt: dateTime(),
    },
  },
  Doc: {
    type: "object",
    required: [
      "id",
      "title",
      "icon",
      "content",
      "authorId",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      id: id(),
      projectId: stringOrNull(),
      title: { type: "string", examples: ["Release checklist"] },
      icon: { type: "string", examples: ["file"] },
      content: { type: "string" },
      authorId: { type: "string" },
      createdAt: dateTime(),
      updatedAt: dateTime(),
    },
  },
  Release: {
    type: "object",
    required: ["id", "version", "repo", "notesMd", "releaseUrl", "createdAt"],
    properties: {
      id: id(),
      version: { type: "string", examples: ["v2.4.0"] },
      repo: { type: "string", examples: ["hearth/api"] },
      notesMd: { type: "string" },
      releaseUrl: { type: "string", format: "uri" },
      createdAt: dateTime(),
    },
  },
  Notification: {
    type: "object",
    required: ["id", "kind", "ticketId", "ticketKey", "ticketTitle", "at"],
    properties: {
      id: { type: "string", examples: ["c:cmtuf…"] },
      kind: { type: "string", enum: ["comment", "assigned", "status"] },
      ticketId: { type: "string" },
      ticketKey: { type: "string" },
      ticketTitle: { type: "string" },
      actorId: { type: "string" },
      at: dateTime(),
      detail: { type: "string" },
    },
  },
  NotificationFeed: {
    type: "object",
    required: ["items"],
    properties: {
      items: arrayOf(ref("Notification")),
      seenAt: dateTime(),
    },
  },
  IntegrationToggle: {
    type: "object",
    required: ["enabled", "available"],
    properties: {
      enabled: {
        type: "boolean",
        description: "Workspace switch (Settings → Integrations).",
      },
      available: {
        type: "boolean",
        description: "Whether the server environment can actually deliver it.",
      },
    },
  },
  Integrations: {
    type: "object",
    required: [
      "slack",
      "email",
      "githubSync",
      "githubProjects",
      "clickup",
      "hearthReleases",
    ],
    properties: {
      slack: ref("IntegrationToggle"),
      email: ref("IntegrationToggle"),
      githubSync: ref("IntegrationToggle"),
      githubProjects: ref("IntegrationToggle"),
      clickup: ref("IntegrationToggle"),
      hearthReleases: ref("IntegrationToggle"),
    },
  },
  Priority: {
    type: "string",
    enum: ["urgent", "high", "medium", "low"],
  },
  IssueType: {
    type: "string",
    enum: ["bug", "feature", "task", "question"],
  },
  Role: {
    type: "string",
    enum: ["admin", "member"],
  },
  DeletedId: {
    type: "object",
    required: ["deleted"],
    properties: { deleted: { type: "string" } },
  },
  DeletedCount: {
    type: "object",
    required: ["deleted"],
    properties: { deleted: { type: "integer" } },
  },
  MovedCount: {
    type: "object",
    required: ["moved"],
    properties: { moved: { type: "integer" } },
  },
  SignInResult: {
    type: "object",
    required: ["ok"],
    properties: { ok: { type: "boolean", enum: [true] } },
  },
  AuthMe: {
    type: "object",
    required: ["user", "isAdmin", "githubConnected"],
    properties: {
      user: ref("User"),
      isAdmin: { type: "boolean" },
      githubConnected: { type: "boolean" },
    },
  },
  VerifyResult: {
    type: "object",
    required: ["user"],
    properties: { user: ref("User") },
  },
  Bootstrap: {
    type: "object",
    required: [
      "users",
      "projects",
      "columns",
      "tickets",
      "docs",
      "integrations",
      "notifications",
      "me",
      "isAdmin",
      "githubConnected",
    ],
    properties: {
      users: arrayOf(ref("User")),
      projects: arrayOf(ref("Project")),
      columns: arrayOf(ref("Column")),
      tickets: arrayOf(ref("Ticket")),
      docs: arrayOf(ref("Doc")),
      integrations: ref("Integrations"),
      notifications: ref("NotificationFeed"),
      me: ref("User"),
      isAdmin: { type: "boolean" },
      githubConnected: { type: "boolean" },
    },
  },
  BootstrapVersion: {
    type: "object",
    required: ["version"],
    properties: { version: { type: "string" } },
  },
  NotificationSeen: {
    type: "object",
    required: ["seenAt"],
    properties: { seenAt: nullable(dateTime()) },
  },
  SettingUpdate: {
    type: "object",
    required: ["key", "enabled"],
    properties: {
      key: { type: "string" },
      enabled: { type: "boolean" },
    },
  },
  GithubProject: {
    type: "object",
    required: ["id", "number", "title", "owner", "items"],
    properties: {
      id: { type: "string" },
      number: { type: "integer" },
      title: { type: "string" },
      owner: { type: "string", examples: ["you", "acme"] },
      items: { type: "integer" },
    },
  },
  ClickupTeam: {
    type: "object",
    required: ["id", "name"],
    properties: { id: { type: "string" }, name: { type: "string" } },
  },
  ClickupList: {
    type: "object",
    required: ["id", "name", "space"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      space: { type: "string" },
    },
  },
  ImportProjectResult: {
    allOf: [
      ref("Project"),
      {
        type: "object",
        required: ["tickets"],
        properties: { tickets: arrayOf(ref("Ticket")) },
      },
    ],
  },
  HealthLive: {
    type: "object",
    required: ["status"],
    properties: { status: { type: "string", enum: ["ok"] } },
  },
  HealthReady: {
    type: "object",
    required: ["status", "checks"],
    properties: {
      status: { type: "string", enum: ["ready"] },
      checks: {
        type: "object",
        required: ["database", "media"],
        properties: {
          database: { type: "string", enum: ["ok"] },
          media: { type: "string", enum: ["ok"] },
        },
      },
    },
  },
  HealthNotReady: {
    type: "object",
    required: ["status"],
    properties: { status: { type: "string", enum: ["not_ready"] } },
  },
  MaintenanceResult: {
    type: "object",
    required: [
      "expiredSessions",
      "expiredLoginCodes",
      "staleWidgetLinks",
      "orphanedMedia",
      "mediaDeleteFailures",
    ],
    properties: {
      expiredSessions: { type: "integer" },
      expiredLoginCodes: { type: "integer" },
      staleWidgetLinks: { type: "integer" },
      orphanedMedia: { type: "integer" },
      mediaDeleteFailures: { type: "integer" },
    },
  },
  WidgetProject: {
    type: "object",
    required: ["id", "key", "name"],
    properties: {
      id: { type: "string" },
      key: { type: "string" },
      name: { type: "string" },
    },
  },
  WidgetSessionUser: {
    type: "object",
    required: ["id", "name", "color"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      color: { type: "string" },
    },
  },
  WidgetColumn: {
    type: "object",
    required: ["id", "label", "dot", "terminal"],
    properties: {
      id: { type: "string" },
      label: { type: "string" },
      dot: { type: "string" },
      terminal: { type: "boolean" },
    },
  },
  WidgetBootstrap: {
    type: "object",
    required: ["project", "user", "columns", "members"],
    properties: {
      project: ref("WidgetProject"),
      user: ref("WidgetSessionUser"),
      columns: arrayOf(ref("WidgetColumn")),
      members: {
        ...arrayOf(ref("WidgetSessionUser")),
        description:
          "Active users, by name. Use their ids as `assigneeId` when assigning.",
      },
    },
  },
  WidgetAuthResult: {
    description:
      "Either a signed-in widget session, or the host email that still needs to be linked.",
    oneOf: [
      {
        type: "object",
        required: ["linked", "user", "token"],
        properties: {
          linked: { type: "boolean", enum: [true] },
          user: ref("WidgetSessionUser"),
          token: {
            type: "string",
            description:
              "Opaque widget-scope bearer token. Send it as `Authorization: Bearer …` together with `X-Tesuto-Project`. Expires after 15 minutes.",
          },
        },
      },
      {
        type: "object",
        required: ["linked", "hostEmail"],
        properties: {
          linked: { type: "boolean", enum: [false] },
          hostEmail: { type: "string", format: "email" },
        },
      },
    ],
  },
  WidgetIssueListItem: {
    type: "object",
    required: [
      "id",
      "key",
      "title",
      "status",
      "priority",
      "createdAt",
      "reporter",
      "comments",
      "open",
    ],
    properties: {
      id: { type: "string" },
      key: { type: "string" },
      title: { type: "string" },
      status: { type: "string" },
      priority: ref("Priority"),
      createdAt: dateTime(),
      sourceUrl: stringOrNull(),
      reporter: { type: "string" },
      comments: { type: "integer" },
      selector: { type: "string" },
      elementText: { type: "string" },
      open: { type: "boolean" },
    },
  },
  WidgetIssue: {
    type: "object",
    required: [
      "id",
      "key",
      "title",
      "description",
      "status",
      "statusLabel",
      "priority",
      "type",
      "createdAt",
      "reporter",
    ],
    properties: {
      id: { type: "string" },
      key: { type: "string" },
      title: { type: "string" },
      description: stringOrNull(),
      status: { type: "string" },
      statusLabel: { type: "string" },
      priority: ref("Priority"),
      type: ref("IssueType"),
      sourceUrl: stringOrNull(),
      screenshotUrl: stringOrNull(),
      recordingUrl: stringOrNull(),
      attachments: arrayOf(ref("MediaAttachment")),
      domSnapshot: nullable(ref("DomSnapshot")),
      context: nullable(ref("TicketContext")),
      createdAt: dateTime(),
      reporter: {
        type: "object",
        required: ["name", "color"],
        properties: {
          name: { type: "string" },
          color: { type: "string" },
        },
      },
    },
  },
  WidgetComment: {
    type: "object",
    required: ["id", "body", "createdAt", "author", "attachments"],
    properties: {
      id: { type: "string" },
      body: { type: "string" },
      createdAt: dateTime(),
      author: ref("WidgetSessionUser"),
      attachments: arrayOf(ref("MediaAttachment")),
    },
  },
  WidgetCreateResult: {
    type: "object",
    required: ["id", "key", "title"],
    properties: {
      id: { type: "string" },
      key: { type: "string", examples: ["SAND-42"] },
      title: { type: "string" },
    },
  },
  WidgetPatchResult: {
    type: "object",
    required: ["id", "status", "priority", "assigneeId"],
    properties: {
      id: { type: "string" },
      status: { type: "string" },
      priority: ref("Priority"),
      assigneeId: stringOrNull(),
    },
  },
  WidgetLinkStartResult: {
    type: "object",
    required: ["ok", "email"],
    properties: {
      ok: { type: "boolean", enum: [true] },
      email: {
        type: "string",
        description: "Masked target address, e.g. `tr•••@example.com`.",
      },
    },
  },
  WidgetSignOutResult: {
    type: "object",
    required: ["ok"],
    properties: { ok: { type: "boolean", enum: [true] } },
  },
  WidgetAssertion: {
    type: "object",
    required: ["assertion"],
    properties: {
      assertion: {
        type: "string",
        description:
          "`base64url(json).base64url(hmac-sha256)` signed by TESUTO_WIDGET_SECRET. Expires in at most 5 minutes.",
      },
    },
  },
  OpenApiDocument: {
    type: "object",
    description: "This OpenAPI 3.1 document.",
    additionalProperties: true,
  },
  SignInRequest: {
    type: "object",
    required: ["email"],
    properties: { email: { type: "string", format: "email", maxLength: 254 } },
  },
  VerifyCodeRequest: {
    type: "object",
    required: ["email", "code"],
    properties: {
      email: { type: "string", format: "email", maxLength: 254 },
      code: { type: "string", pattern: "^\\d{6}$" },
    },
  },
  NewTicketRequest: {
    type: "object",
    required: ["title", "projectId", "priority", "type"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 50_000 },
      projectId: { type: "string", minLength: 1, maxLength: 128 },
      priority: ref("Priority"),
      type: ref("IssueType"),
      assigneeId: { type: "string", maxLength: 128 },
      parentId: { type: "string", maxLength: 128 },
      status: { type: "string", maxLength: 128 },
      sourceUrl: {
        type: "string",
        format: "uri",
        maxLength: 2_048,
        pattern: "^https?://",
      },
      screenshotUrl: {
        type: "string",
        maxLength: 8_000_000,
        pattern: "^data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$",
      },
      recordingUrl: {
        type: "string",
        maxLength: 15_000_000,
        pattern:
          "^data:video/(?:webm|mp4)(?:;[^;,=]+=[^;,]+)*;base64,[A-Za-z0-9+/=]+$",
      },
      annotations: { type: "array", maxItems: 200, items: ref("Annotation") },
      domSnapshot: ref("DomSnapshot"),
      context: ref("TicketContext"),
    },
  },
  TicketPatchRequest: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: nullable({ type: "string", maxLength: 50_000 }),
      status: { type: "string", maxLength: 128 },
      priority: ref("Priority"),
      type: ref("IssueType"),
      assigneeId: nullable({ type: "string", maxLength: 128 }),
      parentId: nullable({ type: "string", maxLength: 128 }),
      order: { type: "number" },
      annotations: nullable({
        type: "array",
        maxItems: 200,
        items: ref("Annotation"),
      }),
    },
  },
  NewCommentRequest: {
    type: "object",
    properties: {
      body: { type: "string", maxLength: 10_000, default: "" },
      voice: {
        type: "string",
        maxLength: 11_000_000,
        pattern:
          "^data:audio/(?:webm|mp4|mpeg|ogg|wav)(?:;[^;,=]+=[^;,]+)*;base64,[A-Za-z0-9+/=]+$",
      },
      attachments: {
        type: "array",
        maxItems: 3,
        default: [],
        items: ref("AttachmentInput"),
      },
    },
    description:
      "At least one of `body`, `voice`, or `attachments` must be present. The server returns 422 otherwise.",
  },
  BulkTicketsRequest: {
    type: "object",
    required: ["action", "ids"],
    properties: {
      action: { type: "string", enum: ["move", "delete"] },
      ids: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        items: { type: "string", maxLength: 128 },
      },
      status: {
        type: "string",
        maxLength: 128,
        description: "Required when action is `move`.",
      },
    },
  },
  NewProjectRequest: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", maxLength: 2_000, default: "" },
    },
  },
  ProjectPatchRequest: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", maxLength: 2_000 },
      githubRepo: nullable({
        type: "string",
        maxLength: 200,
        description: "`owner/repo`, or null to disable sync.",
      }),
    },
  },
  ImportedIssue: {
    type: "object",
    required: ["title", "type", "priority", "resolved"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      body: { type: "string", maxLength: 50_000 },
      type: ref("IssueType"),
      priority: ref("Priority"),
      resolved: { type: "boolean" },
    },
  },
  ImportProjectRequest: {
    type: "object",
    required: ["name", "source", "issues"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: "string", maxLength: 2_000, default: "" },
      source: { type: "string", maxLength: 200 },
      issues: {
        type: "array",
        maxItems: 1_000,
        items: ref("ImportedIssue"),
      },
    },
  },
  NewColumnRequest: {
    type: "object",
    required: ["projectId", "label"],
    properties: {
      projectId: { type: "string", minLength: 1, maxLength: 128 },
      label: { type: "string", minLength: 1, maxLength: 80 },
      description: { type: "string", maxLength: 500 },
      dot: { type: "string", maxLength: 32, examples: ["bg-rose-500"] },
    },
  },
  ColumnPatchRequest: {
    type: "object",
    required: ["projectId"],
    properties: {
      projectId: { type: "string", minLength: 1, maxLength: 128 },
      label: { type: "string", minLength: 1, maxLength: 80 },
      description: nullable({ type: "string", maxLength: 500 }),
      dot: { type: "string", maxLength: 32 },
      terminal: { type: "boolean" },
      limit: nullable({ type: "number" }),
    },
  },
  ReorderColumnsRequest: {
    type: "object",
    required: ["projectId", "ids"],
    properties: {
      projectId: { type: "string", minLength: 1, maxLength: 128 },
      ids: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: { type: "string", maxLength: 128 },
      },
    },
  },
  NewUserRequest: {
    type: "object",
    required: ["name", "email", "role"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      email: { type: "string", format: "email", maxLength: 254 },
      role: ref("Role"),
      title: { type: "string", maxLength: 100 },
    },
  },
  UserPatchRequest: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      email: { type: "string", format: "email", maxLength: 254 },
      role: ref("Role"),
      title: nullable({ type: "string", maxLength: 100 }),
      bio: nullable({ type: "string", maxLength: 2_000 }),
      active: { type: "boolean" },
      color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      githubLogin: nullable({ type: "string", maxLength: 100 }),
    },
  },
  ProfilePatchRequest: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      title: nullable({ type: "string", maxLength: 100 }),
      bio: nullable({ type: "string", maxLength: 2_000 }),
      color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      githubLogin: nullable({ type: "string", maxLength: 100 }),
    },
  },
  NewDocRequest: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      icon: { type: "string", maxLength: 50 },
      projectId: { type: "string", minLength: 1, maxLength: 128 },
    },
  },
  DocPatchRequest: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      icon: { type: "string", maxLength: 50 },
      content: { type: "string", maxLength: 500_000 },
      projectId: nullable({ type: "string", minLength: 1, maxLength: 128 }),
    },
  },
  SettingsToggleRequest: {
    type: "object",
    required: ["key", "enabled"],
    properties: {
      key: {
        type: "string",
        enum: [
          "integration.slack",
          "integration.email",
          "integration.github_sync",
          "integration.github_projects_import",
          "integration.clickup_import",
          "integration.hearth_releases",
        ],
      },
      enabled: { type: "boolean" },
    },
  },
  ReleaseRequest: {
    type: "object",
    required: ["version", "repo", "notesMd", "releaseUrl"],
    properties: {
      version: { type: "string", minLength: 1, maxLength: 100 },
      repo: { type: "string", minLength: 1, maxLength: 200 },
      notesMd: { type: "string", minLength: 1, maxLength: 500_000 },
      releaseUrl: {
        type: "string",
        format: "uri",
        maxLength: 2_048,
        pattern: "^https://",
      },
      releasedAt: dateTime(),
    },
  },
  GithubImportRequest: {
    type: "object",
    required: ["projectId"],
    properties: {
      projectId: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
    },
  },
  ClickupTeamsRequest: {
    type: "object",
    required: ["token"],
    properties: { token: { type: "string", minLength: 10 } },
  },
  ClickupListsRequest: {
    type: "object",
    required: ["token", "teamId"],
    properties: {
      token: { type: "string", minLength: 10 },
      teamId: { type: "string", minLength: 1 },
    },
  },
  ClickupImportRequest: {
    type: "object",
    required: ["token", "listId", "name"],
    properties: {
      token: { type: "string", minLength: 10 },
      listId: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
    },
  },
  WidgetAuthRequest: {
    type: "object",
    required: ["assertion"],
    properties: {
      assertion: { type: "string", minLength: 1, maxLength: 2_048 },
    },
  },
  WidgetLinkRequest: {
    type: "object",
    required: ["assertion", "email"],
    properties: {
      assertion: { type: "string", minLength: 1, maxLength: 2_048 },
      email: { type: "string", format: "email", maxLength: 254 },
    },
  },
  WidgetLinkVerifyRequest: {
    type: "object",
    required: ["assertion", "email", "code"],
    properties: {
      assertion: { type: "string", minLength: 1, maxLength: 2_048 },
      email: { type: "string", format: "email", maxLength: 254 },
      code: { type: "string", pattern: "^\\d{6}$" },
    },
  },
  WidgetCreateRequest: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 50_000 },
      priority: {
        description: "Defaults to `medium` when omitted.",
        anyOf: [ref("Priority")],
        default: "medium",
      },
      sourceUrl: {
        type: "string",
        maxLength: 2_048,
        pattern: "^[A-Za-z][A-Za-z0-9+.-]*://\\S+$",
        description:
          "Web page (`https://…`) or app screen deep link (`myapp://orders/42`). `javascript:`, `data:`, `vbscript:`, `file:`, `blob:` and `about:` are rejected.",
        examples: ["https://app.example.com/checkout", "myapp://checkout"],
      },
      screenshot: {
        type: "string",
        maxLength: 8_000_000,
        description:
          "Base64 image data URL. The decoded image must be ≤ 6 MB after MIME validation.",
        pattern: "^data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$",
      },
      recording: {
        type: "string",
        maxLength: 15_000_000,
        description:
          "Base64 webm/mp4 data URL. The decoded video must be ≤ 11 MB.",
        pattern:
          "^data:video/(?:webm|mp4)(?:;[^;,=]+=[^;,]+)*;base64,[A-Za-z0-9+/=]+$",
      },
      voice: {
        type: "string",
        maxLength: 11_000_000,
        description: "Base64 audio data URL. The decoded audio must be ≤ 8 MB.",
        pattern:
          "^data:audio/(?:webm|mp4|mpeg|ogg|wav)(?:;[^;,=]+=[^;,]+)*;base64,[A-Za-z0-9+/=]+$",
      },
      attachments: {
        type: "array",
        maxItems: 3,
        default: [],
        items: ref("AttachmentInput"),
      },
      domSnapshot: ref("DomSnapshot"),
      context: ref("TicketContext"),
    },
  },
  WidgetCommentRequest: {
    type: "object",
    properties: {
      body: { type: "string", maxLength: 10_000, default: "" },
      voice: {
        type: "string",
        maxLength: 11_000_000,
        pattern:
          "^data:audio/(?:webm|mp4|mpeg|ogg|wav)(?:;[^;,=]+=[^;,]+)*;base64,[A-Za-z0-9+/=]+$",
      },
      attachments: {
        type: "array",
        maxItems: 3,
        default: [],
        items: ref("AttachmentInput"),
      },
    },
    description:
      "At least one of body, voice, or attachments is required; otherwise 422.",
  },
  WidgetPatchRequest: {
    type: "object",
    properties: {
      priority: ref("Priority"),
      status: {
        type: "string",
        description: "A column id from `/api/widget/bootstrap`.",
      },
      assigneeId: {
        ...stringOrNull(),
        maxLength: 128,
        description:
          "An active member id from `/api/widget/bootstrap` `members`, or null to unassign. Unknown or inactive ids return 422.",
      },
    },
  },
}

/* -------------------------------------------------------------------------- */
/* operations                                                                 */
/* -------------------------------------------------------------------------- */

const paths: Record<string, Record<string, ApiOperation>> = {}
const operations: { path: string; method: string; operation: ApiOperation }[] =
  []

function route(path: string, method: string, operation: ApiOperation) {
  const key = method.toLowerCase()
  paths[path] ??= {}
  if (paths[path][key]) {
    throw new Error(`Duplicate OpenAPI operation: ${method} ${path}`)
  }
  // Every app-session mutation can be rejected when a cookie request arrives
  // from a foreign Origin (bearer requests are exempt; see handler()).
  if (operation.security === appAuth && key !== "get") {
    operation.responses[403] ??= errors[403]
  }
  paths[path][key] = operation
  operations.push({ path, method: key, operation })
}

const tags: ApiTag[] = [
  {
    name: "Auth",
    description:
      "Email sign-in for the dashboard. Sessions are HttpOnly cookies; the same routes accept `Authorization: Bearer` on subsequent requests.",
  },
  {
    name: "Bootstrap",
    description:
      "One-shot snapshot of the whole workspace plus a cheap version fingerprint for polling.",
  },
  { name: "Tickets", description: "Tickets, bulk actions, and GitHub sync." },
  { name: "Comments", description: "Ticket discussion threads." },
  {
    name: "Projects",
    description: "Boards and their publishable widget tokens.",
  },
  { name: "Columns", description: "Per-project kanban columns." },
  { name: "Users", description: "Team directory and admin user management." },
  {
    name: "Docs",
    description: "Internal documents attached to a workspace/project.",
  },
  { name: "Notifications", description: "The derived notification feed." },
  { name: "Settings", description: "Workspace integration toggles." },
  { name: "Releases", description: "Hearth prod-release mirror." },
  {
    name: "Imports",
    description: "One-way imports from GitHub Projects and ClickUp.",
  },
  { name: "GitHub", description: "Per-user GitHub OAuth connection." },
  {
    name: "Widget",
    description:
      "The embedded reporter API. Most operations need BOTH `X-Tesuto-Project` and a widget-scope `Authorization: Bearer` token.",
  },
  { name: "Health", description: "Container liveness/readiness probes." },
  { name: "Maintenance", description: "Scheduled cleanup." },
  {
    name: "Media",
    description: "Private screenshots, recordings, voice notes, attachments.",
  },
]

/* ------------------------------- Auth ----------------------------------- */

route("/api/auth/sign-in", "post", {
  tags: ["Auth"],
  summary: "Request a 6-digit sign-in code",
  description:
    "Only existing active accounts receive mail. Unknown addresses still return `{ok:true}` so the endpoint cannot be used as a directory. Limit: 5 requests / 10 minutes per IP + email. In development, `AUTH_DEV_CODE` can replace sending; the code is logged to the server console.",
  operationId: "requestSignInCode",
  security: publicAuth,
  requestBody: jsonBody(ref("SignInRequest"), {
    example: { email: "ava@company.com" },
  }),
  responses: {
    200: json(ok(ref("SignInResult")), "Code request accepted."),
    429: errors[429],
    503: errors[503],
  },
})

route("/api/auth/verify", "post", {
  tags: ["Auth"],
  summary: "Exchange a sign-in code for a session",
  description:
    "Codes are single-use, expire after 10 minutes, and allow 5 attempts. On success the response sets the HttpOnly app-session cookie (`__Host-tesuto_session` in production, `tesuto_session` in development) and returns the user. API clients that cannot use cookies should persist the `Set-Cookie` value.",
  operationId: "verifySignInCode",
  security: publicAuth,
  requestBody: jsonBody(ref("VerifyCodeRequest"), {
    example: { email: "ava@company.com", code: "123456" },
  }),
  responses: {
    200: json(ok(ref("VerifyResult")), "Signed in; session cookie set."),
    401: errors[401],
    422: errors[422],
    429: errors[429],
  },
})

route("/api/auth/sign-out", "post", {
  tags: ["Auth"],
  summary: "Sign out and clear the session cookie",
  operationId: "signOut",
  security: appAuth,
  responses: {
    200: json(ok(ref("SignInResult")), "Session destroyed."),
    401: errors[401],
  },
})

route("/api/auth/me", "get", {
  tags: ["Auth"],
  summary: "Current user",
  operationId: "getCurrentUser",
  security: appAuth,
  responses: {
    200: json(ok(ref("AuthMe")), "Current user and role."),
    401: errors[401],
  },
})

/* ------------------------------ Bootstrap ------------------------------- */

route("/api/bootstrap", "get", {
  tags: ["Bootstrap"],
  summary: "Load the full workspace snapshot",
  description:
    "Users, projects, columns, tickets, docs, integrations, notifications, and the current user in one round trip. Ticket descriptions are sanitized; media is represented by URLs, not bytes.",
  operationId: "getBootstrap",
  security: appAuth,
  responses: {
    200: json(ok(ref("Bootstrap")), "Workspace snapshot."),
    401: errors[401],
  },
})

route("/api/bootstrap/version", "get", {
  tags: ["Bootstrap"],
  summary: "Cheap snapshot fingerprint",
  description:
    "Clients poll this every few seconds and only re-fetch `/api/bootstrap` when the hash changes.",
  operationId: "getBootstrapVersion",
  security: appAuth,
  responses: {
    200: json(ok(ref("BootstrapVersion")), "Current fingerprint."),
    401: errors[401],
  },
})

/* ------------------------------- Tickets -------------------------------- */

route("/api/tickets", "get", {
  tags: ["Tickets"],
  summary: "List tickets",
  operationId: "listTickets",
  security: appAuth,
  parameters: [
    q("projectId", "Filter by project."),
    q("status", "Filter by column/status id."),
    q("assigneeId", "Filter by assignee."),
    q("parentId", "Filter by parent ticket."),
  ],
  responses: {
    200: json(ok(arrayOf(ref("Ticket"))), "Tickets in board order."),
    401: errors[401],
  },
})

route("/api/tickets", "post", {
  tags: ["Tickets"],
  summary: "Create a ticket from the dashboard",
  description:
    "Use `/api/widget/issues` for the widget reporter path. This route accepts inline data URLs for screenshots and recordings but no voice notes or general attachments.",
  operationId: "createTicket",
  security: appAuth,
  requestBody: jsonBody(ref("NewTicketRequest")),
  responses: {
    200: json(ok(ref("Ticket")), "Created ticket."),
    401: errors[401],
    404: errors[404],
    422: errors[422],
    429: errors[429],
    500: errors[500],
  },
})

route("/api/tickets/{id}", "get", {
  tags: ["Tickets"],
  summary: "Get one ticket",
  operationId: "getTicket",
  security: appAuth,
  parameters: [p("id")],
  responses: {
    200: json(ok(ref("Ticket")), "Ticket."),
    401: errors[401],
    404: errors[404],
  },
})

route("/api/tickets/{id}", "patch", {
  tags: ["Tickets"],
  summary: "Update a ticket",
  description:
    "Only fields present are changed. Status changes record a `status` event and update `resolvedAt` when the target column is terminal. Assignment changes record `assigned`/`unassigned` events.",
  operationId: "patchTicket",
  security: appAuth,
  parameters: [p("id")],
  requestBody: jsonBody(ref("TicketPatchRequest")),
  responses: {
    200: json(ok(ref("Ticket")), "Updated ticket."),
    401: errors[401],
    404: errors[404],
    422: errors[422],
  },
})

route("/api/tickets/{id}", "delete", {
  tags: ["Tickets"],
  summary: "Delete a ticket",
  operationId: "deleteTicket",
  security: appAuth,
  parameters: [p("id")],
  responses: {
    200: json(ok(ref("DeletedCount")), "Deleted count."),
    401: errors[401],
  },
})

route("/api/tickets/{id}/comments", "get", {
  tags: ["Comments"],
  summary: "List a ticket's comments",
  description:
    "Oldest first, capped at the latest 200 rows. The app payload has `authorId`; use `/api/users` or bootstrap to resolve names.",
  operationId: "listTicketComments",
  security: appAuth,
  parameters: [p("id")],
  responses: {
    200: json(ok(arrayOf(ref("Comment"))), "Comments."),
    401: errors[401],
  },
})

route("/api/tickets/{id}/comments", "post", {
  tags: ["Comments"],
  summary: "Add a comment",
  operationId: "addTicketComment",
  security: appAuth,
  parameters: [p("id")],
  requestBody: jsonBody(ref("NewCommentRequest")),
  responses: {
    200: json(ok(ref("Comment")), "Created comment."),
    400: errors[400],
    401: errors[401],
    404: errors[404],
    422: errors[422],
    429: errors[429],
  },
})

route("/api/tickets/{id}/sync-github", "post", {
  tags: ["Tickets"],
  summary: "Create a GitHub issue for a ticket",
  description:
    "Requires the acting user's GitHub OAuth connection and an `owner/repo` set on the project. The board remains the source of truth; this is a one-way, manual sync. Returns the updated ticket with `githubIssueUrl`.",
  operationId: "syncTicketToGithub",
  security: appAuth,
  parameters: [p("id")],
  responses: {
    200: json(ok(ref("Ticket")), "Ticket with GitHub URL."),
    400: errors[400],
    401: errors[401],
    403: errors[403],
    404: errors[404],
    424: errors[424],
  },
})

route("/api/tickets/bulk", "post", {
  tags: ["Tickets"],
  summary: "Bulk move or delete tickets",
  operationId: "bulkTickets",
  security: appAuth,
  requestBody: jsonBody(ref("BulkTicketsRequest"), {
    example: {
      action: "move",
      ids: ["cmtuf5v1z000fpn9yzy9wgr39"],
      status: "done",
    },
  }),
  responses: {
    200: {
      description: "Move count or delete count.",
      headers: { "X-Request-Id": { $ref: "#/components/headers/XRequestId" } },
      content: {
        "application/json": {
          schema: {
            oneOf: [ok(ref("MovedCount")), ok(ref("DeletedCount"))],
          },
        },
      },
    },
    401: errors[401],
    422: errors[422],
  },
})

/* ------------------------------- Projects -------------------------------- */

route("/api/projects", "get", {
  tags: ["Projects"],
  summary: "List projects",
  operationId: "listProjects",
  security: appAuth,
  responses: {
    200: json(ok(arrayOf(ref("Project"))), "Projects."),
    401: errors[401],
  },
})

route("/api/projects", "post", {
  tags: ["Projects"],
  summary: "Create a project",
  description: "Also seeds the default columns and a publishable widget token.",
  operationId: "createProject",
  security: appAuth,
  requestBody: jsonBody(ref("NewProjectRequest")),
  responses: {
    200: json(ok(ref("Project")), "Created project."),
    401: errors[401],
    409: errors[409],
    422: errors[422],
  },
})

route("/api/projects/{id}", "patch", {
  tags: ["Projects"],
  summary: "Update a project",
  operationId: "updateProject",
  security: appAuth,
  parameters: [p("id")],
  requestBody: jsonBody(ref("ProjectPatchRequest")),
  responses: {
    200: json(ok(ref("Project")), "Updated project."),
    401: errors[401],
    404: errors[404],
    409: errors[409],
    422: errors[422],
  },
})

route("/api/projects/{id}", "delete", {
  tags: ["Projects"],
  summary: "Delete a project and its tickets",
  operationId: "deleteProject",
  security: appAuth,
  parameters: [p("id")],
  responses: {
    200: json(ok(ref("DeletedId")), "Deleted project id."),
    401: errors[401],
    404: errors[404],
  },
})

route("/api/projects/import", "post", {
  tags: ["Projects"],
  summary: "Import a pre-fetched issue list as a project",
  description:
    "The generic import endpoint. Prefer the provider-specific routes for GitHub Projects or ClickUp; they fetch the source data first.",
  operationId: "importProject",
  security: appAuth,
  requestBody: jsonBody(ref("ImportProjectRequest")),
  responses: {
    200: json(ok(ref("ImportProjectResult")), "Created project with tickets."),
    401: errors[401],
    409: errors[409],
    422: errors[422],
  },
})

/* -------------------------------- Columns -------------------------------- */

route("/api/columns", "get", {
  tags: ["Columns"],
  summary: "List columns",
  operationId: "listColumns",
  security: appAuth,
  parameters: [
    q("projectId", "Optional project filter; omit for every project."),
  ],
  responses: {
    200: json(ok(arrayOf(ref("Column"))), "Columns in order."),
    401: errors[401],
  },
})

route("/api/columns", "post", {
  tags: ["Columns"],
  summary: "Create a column",
  operationId: "createColumn",
  security: appAuth,
  requestBody: jsonBody(ref("NewColumnRequest")),
  responses: {
    200: json(ok(ref("Column")), "Created column."),
    401: errors[401],
    422: errors[422],
  },
})

route("/api/columns/{id}", "patch", {
  tags: ["Columns"],
  summary: "Update a column",
  description:
    "`projectId` is part of the body because column ids are only unique within a project.",
  operationId: "updateColumn",
  security: appAuth,
  parameters: [p("id")],
  requestBody: jsonBody(ref("ColumnPatchRequest")),
  responses: {
    200: json(ok(ref("Column")), "Updated column."),
    401: errors[401],
    404: errors[404],
    422: errors[422],
  },
})

route("/api/columns/{id}", "delete", {
  tags: ["Columns"],
  summary: "Delete a column",
  description:
    "Moves that column's tickets to `reassignTo`. The last remaining column cannot be deleted. `projectId` and `reassignTo` are **query parameters** on this DELETE — `handler()` parses query strings for DELETE requests, not the body.",
  operationId: "deleteColumn",
  security: appAuth,
  parameters: [
    p("id"),
    q("projectId", "Project that owns the column.", { type: "string" }, true),
    q(
      "reassignTo",
      "Column id that receives the deleted column's tickets.",
      { type: "string" },
      true,
    ),
  ],
  responses: {
    200: json(ok(ref("DeletedId")), "Deleted column id."),
    400: errors[400],
    401: errors[401],
    422: errors[422],
  },
})

route("/api/columns/reorder", "post", {
  tags: ["Columns"],
  summary: "Reorder columns",
  operationId: "reorderColumns",
  security: appAuth,
  requestBody: jsonBody(ref("ReorderColumnsRequest")),
  responses: {
    200: json(ok(arrayOf(ref("Column"))), "Columns in the new order."),
    401: errors[401],
    422: errors[422],
  },
})

/* --------------------------------- Users --------------------------------- */

route("/api/users", "get", {
  tags: ["Users"],
  summary: "List the team",
  operationId: "listUsers",
  security: appAuth,
  responses: {
    200: json(ok(arrayOf(ref("User"))), "All users, including inactive ones."),
    401: errors[401],
  },
})

route("/api/users", "post", {
  tags: ["Users"],
  summary: "Invite a user (admin)",
  operationId: "createUser",
  security: appAuth,
  requestBody: jsonBody(ref("NewUserRequest")),
  responses: {
    200: json(ok(ref("User")), "Created user."),
    403: errors[403],
    401: errors[401],
    409: errors[409],
    422: errors[422],
  },
})

route("/api/users/{id}", "patch", {
  tags: ["Users"],
  summary: "Update a user (admin)",
  description:
    "Deactivating a user deletes their sessions. The workspace must keep at least one active admin.",
  operationId: "updateUser",
  security: appAuth,
  parameters: [p("id")],
  requestBody: jsonBody(ref("UserPatchRequest")),
  responses: {
    200: json(ok(ref("User")), "Updated user."),
    401: errors[401],
    403: errors[403],
    404: errors[404],
    409: errors[409],
    422: errors[422],
  },
})

route("/api/users/{id}", "delete", {
  tags: ["Users"],
  summary: "Delete a user (admin)",
  description:
    "Only safe for users with no reported tickets, comments, or docs. Otherwise deactivate instead and the API returns 409.",
  operationId: "deleteUser",
  security: appAuth,
  parameters: [p("id")],
  responses: {
    200: json(ok(ref("DeletedId")), "Deleted user id."),
    401: errors[401],
    403: errors[403],
    404: errors[404],
    409: errors[409],
  },
})

/* ---------------------------------- Me ----------------------------------- */

route("/api/me", "patch", {
  tags: ["Users"],
  summary: "Update your own profile",
  operationId: "updateProfile",
  security: appAuth,
  requestBody: jsonBody(ref("ProfilePatchRequest")),
  responses: {
    200: json(ok(ref("User")), "Updated profile."),
    401: errors[401],
    422: errors[422],
  },
})

route("/api/me/github", "delete", {
  tags: ["GitHub"],
  summary: "Disconnect your GitHub account",
  description:
    "Clears the encrypted token and login. Ticket sync fails until the account is reconnected.",
  operationId: "unlinkGithub",
  security: appAuth,
  responses: {
    200: json(ok(ref("User")), "Updated user."),
    401: errors[401],
  },
})

/* ---------------------------------- Docs --------------------------------- */

route("/api/docs", "get", {
  tags: ["Docs"],
  summary: "List docs",
  operationId: "listDocs",
  security: appAuth,
  responses: {
    200: json(ok(arrayOf(ref("Doc"))), "Docs, newest first."),
    401: errors[401],
  },
})

route("/api/docs", "post", {
  tags: ["Docs"],
  summary: "Create a doc",
  operationId: "createDoc",
  security: appAuth,
  requestBody: jsonBody(ref("NewDocRequest")),
  responses: {
    200: json(ok(ref("Doc")), "Created doc."),
    401: errors[401],
    422: errors[422],
  },
})

route("/api/docs/{id}", "patch", {
  tags: ["Docs"],
  summary: "Update a doc",
  operationId: "updateDoc",
  security: appAuth,
  parameters: [p("id")],
  requestBody: jsonBody(ref("DocPatchRequest")),
  responses: {
    200: json(ok(ref("Doc")), "Updated doc."),
    401: errors[401],
    404: errors[404],
    422: errors[422],
  },
})

route("/api/docs/{id}", "delete", {
  tags: ["Docs"],
  summary: "Delete a doc",
  operationId: "deleteDoc",
  security: appAuth,
  parameters: [p("id")],
  responses: {
    200: json(ok(ref("DeletedId")), "Deleted doc id."),
    401: errors[401],
  },
})

/* ----------------------------- Notifications ----------------------------- */

route("/api/notifications/seen", "post", {
  tags: ["Notifications"],
  summary: "Mark the notification feed read",
  operationId: "markNotificationsSeen",
  security: appAuth,
  responses: {
    200: json(ok(ref("NotificationSeen")), "New `seenAt` timestamp."),
    401: errors[401],
  },
})

/* -------------------------------- Settings ------------------------------- */

route("/api/settings/integrations", "patch", {
  tags: ["Settings"],
  summary: "Toggle a workspace integration (admin)",
  operationId: "setIntegration",
  security: appAuth,
  requestBody: jsonBody(ref("SettingsToggleRequest"), {
    example: { key: "integration.email", enabled: false },
  }),
  responses: {
    200: json(ok(ref("SettingUpdate")), "Toggle updated."),
    401: errors[401],
    403: errors[403],
    422: errors[422],
  },
})

/* -------------------------------- Releases ------------------------------- */

route("/api/releases", "get", {
  tags: ["Releases"],
  summary: "List mirrored Hearth releases",
  operationId: "listReleases",
  security: appAuth,
  responses: {
    200: json(ok(arrayOf(ref("Release"))), "Releases, newest first."),
    401: errors[401],
    403: errors[403],
  },
})

route("/api/releases", "post", {
  tags: ["Releases"],
  summary: "Post a release from Hearth CI",
  description:
    "Authenticated by `X-Release-Secret` (HMAC-free constant-time compare), not by a Tesuto session. Disabled when `HEARTH_RELEASES_SECRET` is unset.",
  operationId: "createRelease",
  security: [{ releaseSecret: [] }],
  requestBody: jsonBody(ref("ReleaseRequest")),
  responses: {
    200: json(ok(ref("Release")), "Stored release."),
    401: errors[401],
    422: errors[422],
  },
})

/* -------------------------------- Imports -------------------------------- */

route("/api/import/github/projects", "get", {
  tags: ["Imports"],
  summary: "List importable GitHub Projects boards",
  description:
    "Uses the signed-in user's GitHub OAuth token. Requires the `read:project` and `read:org` scopes.",
  operationId: "listGithubProjects",
  security: appAuth,
  responses: {
    200: json(ok(arrayOf(ref("GithubProject"))), "Visible boards."),
    401: errors[401],
    403: errors[403],
    424: errors[424],
  },
})

route("/api/import/github", "post", {
  tags: ["Imports"],
  summary: "Import a GitHub Projects board",
  operationId: "importGithubProject",
  security: appAuth,
  requestBody: jsonBody(ref("GithubImportRequest")),
  responses: {
    200: json(ok(ref("ImportProjectResult")), "Created project with tickets."),
    401: errors[401],
    403: errors[403],
    404: errors[404],
    409: errors[409],
    422: errors[422],
    424: errors[424],
  },
})

route("/api/import/clickup/teams", "post", {
  tags: ["Imports"],
  summary: "List ClickUp workspaces for a pasted token",
  operationId: "listClickupTeams",
  security: appAuth,
  requestBody: jsonBody(ref("ClickupTeamsRequest")),
  responses: {
    200: json(ok(arrayOf(ref("ClickupTeam"))), "Workspaces."),
    401: errors[401],
    403: errors[403],
    422: errors[422],
    424: errors[424],
  },
})

route("/api/import/clickup/lists", "post", {
  tags: ["Imports"],
  summary: "List ClickUp lists in a workspace",
  operationId: "listClickupLists",
  security: appAuth,
  requestBody: jsonBody(ref("ClickupListsRequest")),
  responses: {
    200: json(ok(arrayOf(ref("ClickupList"))), "Lists, including folders."),
    401: errors[401],
    403: errors[403],
    422: errors[422],
    424: errors[424],
  },
})

route("/api/import/clickup", "post", {
  tags: ["Imports"],
  summary: "Import a ClickUp list",
  description:
    "The ClickUp token travels in the request body for this one pull and is never persisted.",
  operationId: "importClickupList",
  security: appAuth,
  requestBody: jsonBody(ref("ClickupImportRequest")),
  responses: {
    200: json(ok(ref("ImportProjectResult")), "Created project with tickets."),
    401: errors[401],
    403: errors[403],
    409: errors[409],
    422: errors[422],
    424: errors[424],
  },
})

/* --------------------------------- GitHub -------------------------------- */

route("/api/github/connect", "get", {
  tags: ["GitHub"],
  summary: "Start GitHub OAuth",
  description:
    "Returns a GitHub authorize URL for the signed-in user. Navigate the browser there; GitHub redirects to `/api/github/callback`.",
  operationId: "startGithubOAuth",
  security: appAuth,
  responses: {
    200: json(
      ok({
        type: "object",
        required: ["url"],
        properties: { url: { type: "string", format: "uri" } },
      }),
      "GitHub authorize URL.",
    ),
    401: errors[401],
    500: errors[500],
  },
})

route("/api/github/callback", "get", {
  tags: ["GitHub"],
  summary: "GitHub OAuth callback",
  description:
    "Called by GitHub, not by clients. Verifies the HMAC-signed state, exchanges the code, encrypts and stores the token, then redirects to `/settings?github=…`.",
  operationId: "githubOAuthCallback",
  security: publicAuth,
  parameters: [
    q("code", "GitHub authorization code.", { type: "string" }, true),
    q(
      "state",
      "HMAC-signed state minted by `/api/github/connect`.",
      {
        type: "string",
      },
      true,
    ),
    q("error", "Set by GitHub when the user cancels.", { type: "string" }),
  ],
  responses: {
    302: {
      description:
        "Redirect to `/settings` with `github=connected|cancelled|invalid_state|error`.",
      headers: {
        Location: {
          description: "Settings URL with the outcome query parameter.",
          schema: { type: "string" },
        },
      },
    },
  },
})

/* --------------------------------- Widget -------------------------------- */

route("/api/widget/project", "get", {
  tags: ["Widget"],
  summary: "Validate a project token",
  description:
    "Public project lookup used by the widget sign-in screen. Only the project token is required; no user session.",
  operationId: "getWidgetProject",
  security: projectAuth,
  responses: {
    200: json(ok(ref("WidgetProject")), "Project identity."),
    401: errors[401],
  },
})

route("/api/widget/auth", "post", {
  tags: ["Widget"],
  summary: "Mint a widget session from a signed assertion",
  description:
    "The host backend signs `{ email, name, exp }` with `TESUTO_WIDGET_SECRET` (expiry ≤ 5 minutes). If the host email is already linked, this returns `{linked:true,user,token}`; otherwise it returns `{linked:false,hostEmail}` and the client must run the link flow. Widget sessions last 15 minutes.",
  operationId: "widgetSignIn",
  security: projectAuth,
  requestBody: jsonBody(ref("WidgetAuthRequest"), {
    example: {
      assertion:
        "eyJlbWFpbCI6ImF2YUBjb21wYW55LmNvbSIsImV4cCI6MTc2MTU1MDAwMH0.…",
    },
  }),
  responses: {
    200: json(ok(ref("WidgetAuthResult")), "Session or link-needed result."),
    401: errors[401],
    403: errors[403],
    422: errors[422],
    429: errors[429],
    500: errors[500],
  },
})

route("/api/widget/auth", "delete", {
  tags: ["Widget"],
  summary: "Sign out a widget session",
  description:
    "Destroys the bearer session. The project token is not required.",
  operationId: "widgetSignOut",
  security: [{ widgetBearer: [] }],
  responses: {
    200: json(ok(ref("WidgetSignOutResult")), "Session destroyed."),
    401: errors[401],
  },
})

route("/api/widget/bootstrap", "get", {
  tags: ["Widget"],
  summary: "Widget bootstrap",
  description:
    "Project, signed-in user, and the project's columns. Requires both widget credentials.",
  operationId: "getWidgetBootstrap",
  security: widgetAuth,
  responses: {
    200: json(ok(ref("WidgetBootstrap")), "Widget bootstrap payload."),
    401: errors[401],
  },
})

route("/api/widget/issues", "get", {
  tags: ["Widget"],
  summary: "List widget issues",
  description:
    "`scope=all` (default) lists tickets assigned to the signed-in user. `scope=mine` lists tickets the signed-in user reported. `scope=page` with `url` lists every ticket whose `sourceUrl` matches that page or app screen (triage view); omitting `url` returns every ticket in the project. Newest first. Pages are `limit` rows; when more exist the response carries `X-Next-Cursor` — pass it back as `cursor`. Both widget credentials are required.",
  operationId: "listWidgetIssues",
  security: widgetAuth,
  parameters: [
    q(
      "scope",
      "`all` (assigned to me, default), `mine` (reported by me), or `page`.",
      {
        type: "string",
        enum: ["all", "mine", "page"],
        default: "all",
      },
    ),
    q("url", "Page URL or app deep link for `scope=page` (max 2048 chars).", {
      type: "string",
      maxLength: 2_048,
    }),
    q("limit", "Page size.", {
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: 100,
    }),
    q("cursor", "`X-Next-Cursor` from the previous page.", {
      type: "string",
      maxLength: 128,
    }),
  ],
  responses: {
    200: withHeaders(json(ok(arrayOf(ref("WidgetIssueListItem"))), "Issues."), {
      "X-Next-Cursor": {
        description:
          "Present only when another page exists. Send it as `cursor`.",
        schema: { type: "string" },
      },
    }),
    401: errors[401],
    422: errors[422],
  },
})

route("/api/widget/issues", "post", {
  tags: ["Widget"],
  summary: "File a bug report (widget entry point)",
  description:
    "The widget entry point. Send BOTH `X-Tesuto-Project` and `Authorization: Bearer <widget session>`. The reporter is the linked Tesuto user. The body is validated before authentication, so a malformed unauthenticated request may return 422 instead of 401. Send an `Idempotency-Key` to make retries safe: repeating a key returns the original ticket (with `Idempotent-Replayed: true`) instead of filing a duplicate. Keys are scoped to the reporter and do not expire.",
  operationId: "createWidgetIssue",
  security: widgetAuth,
  parameters: [
    h(
      "Idempotency-Key",
      "Client-generated id for this report (e.g. a UUID made when the user taps Submit). Reuse it on every retry of the same report.",
      { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$" },
    ),
  ],
  requestBody: jsonBody(ref("WidgetCreateRequest"), {
    example: {
      title: "Checkout button stays disabled",
      description: "Tapping Pay does nothing on iOS Safari.",
      priority: "high",
      sourceUrl: "https://app.example.com/checkout",
      context: {
        browser: "Safari 18",
        os: "iOS 18.1",
        viewport: "390×844",
        consoleErrors: ["TypeError: undefined is not an object"],
        steps: [
          {
            kind: "click",
            at: "2026-10-26T09:40:12.000Z",
            target: "button[data-testid=pay]",
            text: "Pay",
          },
        ],
      },
    },
  }),
  responses: {
    200: withHeaders(
      json(
        ok(ref("WidgetCreateResult")),
        "Created ticket, or the original ticket when the `Idempotency-Key` was seen before.",
      ),
      {
        "Idempotent-Replayed": {
          description:
            "`true` when this response replays an earlier create with the same key.",
          schema: { type: "string", enum: ["true"] },
        },
      },
    ),
    401: errors[401],
    409: problemJson(
      409,
      "`IDEMPOTENCY_KEY_REUSED`: this reporter already used the key for another project.",
    ),
    422: errors[422],
    429: errors[429],
    500: errors[500],
  },
})

route("/api/widget/issues/{id}", "get", {
  tags: ["Widget"],
  summary: "Get a widget issue",
  description:
    "Returns signed media URLs (15-minute expiry) for screenshots, recordings, and attachments.",
  operationId: "getWidgetIssue",
  security: widgetAuth,
  parameters: [p("id")],
  responses: {
    200: json(ok(ref("WidgetIssue")), "Issue detail."),
    401: errors[401],
    404: errors[404],
  },
})

route("/api/widget/issues/{id}", "patch", {
  tags: ["Widget"],
  summary: "Update an issue's status, priority, or assignee",
  description:
    "Only fields present change. Assigning records an `assigned` event and notifies the new assignee, exactly like the dashboard.",
  operationId: "patchWidgetIssue",
  security: widgetAuth,
  parameters: [p("id")],
  requestBody: jsonBody(ref("WidgetPatchRequest"), {
    example: { assigneeId: "cmtuf5v1z000fpn9yzy9wgr39", status: "todo" },
  }),
  responses: {
    200: json(ok(ref("WidgetPatchResult")), "Updated issue."),
    401: errors[401],
    404: errors[404],
    422: errors[422],
  },
})

route("/api/widget/issues/{id}/comments", "get", {
  tags: ["Widget"],
  summary: "List an issue's comments",
  operationId: "listWidgetComments",
  security: widgetAuth,
  parameters: [p("id")],
  responses: {
    200: json(ok(arrayOf(ref("WidgetComment"))), "Comments, oldest first."),
    401: errors[401],
    404: errors[404],
  },
})

route("/api/widget/issues/{id}/comments", "post", {
  tags: ["Widget"],
  summary: "Post a comment or attachment",
  operationId: "addWidgetComment",
  security: widgetAuth,
  parameters: [p("id")],
  requestBody: jsonBody(ref("WidgetCommentRequest"), {
    example: { body: "This also happens after a hard refresh." },
  }),
  responses: {
    200: json(ok(ref("WidgetComment")), "Created comment."),
    401: errors[401],
    404: errors[404],
    422: errors[422],
    429: errors[429],
  },
})

route("/api/widget/link", "post", {
  tags: ["Widget"],
  summary: "Link a host identity to a Tesuto email (step 1)",
  description:
    "Mails a 6-digit code to the claimed email. The assertion proves the host identity; no project token is required. Resends are throttled to one per minute per host email.",
  operationId: "startWidgetLink",
  security: publicAuth,
  requestBody: jsonBody(ref("WidgetLinkRequest")),
  responses: {
    200: json(
      ok(ref("WidgetLinkStartResult")),
      "Code sent (or silently ignored for unknown/inactive accounts).",
    ),
    401: errors[401],
    422: errors[422],
    429: errors[429],
    503: errors[503],
  },
})

route("/api/widget/link/verify", "post", {
  tags: ["Widget"],
  summary: "Verify the link code (step 2)",
  description:
    "Codes expire after 10 minutes and allow 5 attempts. On success the host email is permanently linked and a widget session is returned.",
  operationId: "verifyWidgetLink",
  security: publicAuth,
  requestBody: jsonBody(ref("WidgetLinkVerifyRequest")),
  responses: {
    200: json(ok(ref("WidgetAuthResult")), "Linked session."),
    400: errors[400],
    401: errors[401],
    422: errors[422],
    429: errors[429],
  },
})

route("/api/widget/demo-assertion", "get", {
  tags: ["Widget"],
  summary: "Mint an assertion for the in-app widget playground",
  description:
    "Dashboard-only convenience endpoint. External hosts must mint assertions on their own server with the shared secret; never ship the secret to an untrusted client.",
  operationId: "getWidgetDemoAssertion",
  security: appAuth,
  responses: {
    200: json(ok(ref("WidgetAssertion")), "Short-lived assertion."),
    401: errors[401],
    503: errors[503],
  },
})

/* --------------------------------- Health -------------------------------- */

route("/api/health/live", "get", {
  tags: ["Health"],
  summary: "Liveness probe",
  description: "Direct health payload. Never cached.",
  operationId: "healthLive",
  security: publicAuth,
  responses: {
    200: json(ref("HealthLive"), "Process is alive."),
  },
})

route("/api/health/ready", "get", {
  tags: ["Health"],
  summary: "Readiness probe",
  description:
    "Checks Postgres and the media storage volume. Returns 503 when either check fails.",
  operationId: "healthReady",
  security: publicAuth,
  responses: {
    200: json(ref("HealthReady"), "Database and media storage are ready."),
    503: json(ref("HealthNotReady"), "Not ready."),
  },
})

/* ------------------------------- Maintenance ----------------------------- */

route("/api/maintenance/cleanup", "post", {
  tags: ["Maintenance"],
  summary: "Run scheduled cleanup",
  description:
    "Deletes expired sessions/login codes, stale unverified widget links, and orphaned media files older than the grace period. Requires `Authorization: Bearer <MAINTENANCE_SECRET>`.",
  operationId: "runMaintenance",
  security: [{ maintenanceBearer: [] }],
  responses: {
    200: json(ok(ref("MaintenanceResult")), "Cleanup summary."),
    401: errors[401],
    500: errors[500],
  },
})

/* --------------------------------- Media --------------------------------- */

route("/api/media/{id}", "get", {
  tags: ["Media"],
  summary: "Download private ticket media",
  description:
    "Authenticated by an app session cookie/bearer OR by the 15-minute `expires` + `signature` query grant returned by widget endpoints. Supports HTTP Range requests for video/audio. Error responses use `application/problem+json`.",
  operationId: "getMedia",
  security: [
    { appBearer: [] },
    { appCookie: [] },
    { mediaExpires: [], mediaSignature: [] },
  ],
  parameters: [
    p("id"),
    q("download", "Original filename to send as an attachment.", {
      type: "string",
    }),
    q("expires", "Signed grant expiry (unix seconds).", {
      type: "integer",
    }),
    q("signature", "HMAC grant signature.", { type: "string" }),
    h("Range", "Standard `bytes=start-end` range request.", {
      type: "string",
      examples: ["bytes=0-1023"],
    }),
  ],
  responses: {
    200: {
      description:
        "Full media body. `Content-Type` is the stored MIME type (e.g. `image/png`, `video/mp4`, `audio/webm`).",
      content: {
        "*/*": {
          schema: { type: "string", format: "binary" },
        },
      },
    },
    206: {
      description: "Partial media body with `Content-Range`.",
      content: {
        "*/*": {
          schema: { type: "string", format: "binary" },
        },
      },
    },
    401: errors[401],
    404: errors[404],
    416: problemJson(416, "Invalid or unsatisfiable range."),
    503: errors[503],
  },
})

/* -------------------------------------------------------------------------- */
/* document                                                                   */
/* -------------------------------------------------------------------------- */

// Kept short: this renders at the top of /swagger. The full guide (auth flows,
// limits, CORS, error handling) lives in docs/api/README.md.
const description = `Dashboard and widget API. Success responses return the resource directly; errors are \`application/problem+json\` with a stable \`code\` and a \`requestId\`.

Click **Authorize** and paste a session token to try requests.`

export const openapi: OpenApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Tesuto API",
    version: "1.0.0",
    description,
  },
  servers: [
    {
      url: "/",
      description:
        "This server",
    },
  ],
  tags,
  paths,
  components: {
    securitySchemes: {
      appBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description:
          "Dashboard session token from the HttpOnly `Set-Cookie` header returned by `/api/auth/verify`. The same opaque token works as a bearer credential on subsequent app API calls.",
      },
      appCookie: {
        type: "apiKey",
        in: "cookie",
        name: "__Host-tesuto_session",
        description:
          "Production dashboard session cookie (HttpOnly, Secure, SameSite=Lax). Development uses `tesuto_session` without the prefix.",
      },
      widgetBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description:
          "15-minute widget-scope session returned by `/api/widget/auth` or `/api/widget/link/verify`. Must be sent together with `projectToken` on widget issue routes.",
      },
      projectToken: {
        type: "apiKey",
        in: "header",
        name: "X-Tesuto-Project",
        description:
          "Publishable project token (`tsto_pk_…`) from the project settings screen. Identifies the board; it is not a user session.",
      },
      releaseSecret: {
        type: "apiKey",
        in: "header",
        name: "X-Release-Secret",
        description: "Shared secret with Hearth CI (`HEARTH_RELEASES_SECRET`).",
      },
      maintenanceBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description: "`MAINTENANCE_SECRET` value.",
      },
      mediaExpires: {
        type: "apiKey",
        in: "query",
        name: "expires",
        description: "Signed media grant expiry, unix seconds.",
      },
      mediaSignature: {
        type: "apiKey",
        in: "query",
        name: "signature",
        description: "HMAC signature for a signed media grant.",
      },
    },
    schemas,
    headers: {
      XRequestId: {
        description:
          "Request correlation id. Echoed from an incoming valid `X-Request-Id`, otherwise generated.",
        schema: { type: "string" },
      },
    },
  },
}

/** Tags in display order. */
export const apiTags = tags
