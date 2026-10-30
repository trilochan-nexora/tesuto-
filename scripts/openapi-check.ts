/**
 * OpenAPI guardrail.
 *
 *   bun run api:check
 *
 * - Every exported route handler method (except HEAD/OPTIONS) must exist in
 *   lib/openapi.ts.
 * - No documented operation may point at a route that does not exist.
 * - Every path parameter must be declared, every operation needs a summary,
 *   tags, unique operationId, and responses.
 * - Every response must resolve to content with a schema; redirects and
 *   204/205/304 are the only bodyless responses allowed.
 * - Every internal $ref must resolve.
 *
 * This is intentionally dependency-free so it can run in CI without installing
 * a linter on top of the app.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
  type ApiOperation,
  type ApiResponse,
  apiTags,
  openapi,
} from "../lib/openapi"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const API_DIR = join(ROOT, "app", "api")
const METHODS = new Set([
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
  "HEAD",
  "OPTIONS",
])
const IGNORED = new Set(["HEAD", "OPTIONS"])

type Route = {
  file: string
  path: string
  methods: Set<string>
}

const errors: string[] = []
const warnings: string[] = []

function fail(message: string) {
  errors.push(message)
}

function warn(message: string) {
  warnings.push(message)
}

function walkFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    else if (entry.isFile() && entry.name === "route.ts") out.push(full)
  }
  return out
}

function routePath(file: string): string {
  const rel = relative(ROOT, file).split(sep).join("/")
  const withoutApp = rel.replace(/^app/, "")
  const withoutFile = withoutApp.replace(/\/route\.ts$/, "")
  return withoutFile.replace(/\[([^\]]+)\]/g, "{$1}") || "/"
}

function exportedMethods(source: string): string[] {
  const methods = new Set<string>()
  const pattern =
    /export\s+(?:(?:async\s+)?function\s+|const\s+)(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)\b/g
  for (const match of source.matchAll(pattern)) {
    if (METHODS.has(match[1])) methods.add(match[1])
  }
  return [...methods]
}

const routes: Route[] = walkFiles(API_DIR).map((file) => ({
  file,
  path: routePath(file),
  methods: new Set(exportedMethods(readFileSync(file, "utf8"))),
}))

const routeMap = new Map<string, Route>()
for (const route of routes) {
  const existing = routeMap.get(route.path)
  if (existing) {
    for (const method of route.methods) existing.methods.add(method)
  } else {
    routeMap.set(route.path, route)
  }
}

/* -------------------------------------------------------------------------- */
/* route coverage                                                             */
/* -------------------------------------------------------------------------- */

let checkedOperations = 0

for (const [path, route] of routeMap) {
  for (const method of route.methods) {
    if (IGNORED.has(method)) continue
    checkedOperations++
    const operation = openapi.paths[path]?.[method.toLowerCase()]
    if (!operation) {
      fail(
        `Undocumented route: ${method} ${path} (${relative(ROOT, route.file)})`,
      )
    }
  }
}

for (const [path, methods] of Object.entries(openapi.paths)) {
  if (!path.startsWith("/api/")) {
    fail(`Documented path is outside /api: ${path}`)
  }
  const route = routeMap.get(path)
  if (!route) {
    fail(`Documented path has no route handler: ${path}`)
    continue
  }
  for (const method of Object.keys(methods)) {
    if (IGNORED.has(method.toUpperCase())) continue
    if (!route.methods.has(method.toUpperCase())) {
      fail(
        `Documented operation has no handler: ${method.toUpperCase()} ${path}`,
      )
    }
  }
}

/* -------------------------------------------------------------------------- */
/* $ref resolution                                                            */
/* -------------------------------------------------------------------------- */

const spec = openapi as unknown

function resolvePointer(reference: string): unknown {
  if (!reference.startsWith("#/")) return undefined
  let current: unknown = spec
  for (const raw of reference.slice(2).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~")
    if (
      !current ||
      typeof current !== "object" ||
      !(key in (current as Record<string, unknown>))
    ) {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/* -------------------------------------------------------------------------- */
/* operation structure                                                        */
/* -------------------------------------------------------------------------- */

const operationIds = new Set<string>()
const tagNames = new Set(apiTags.map((tag) => tag.name))
const securitySchemes = new Set(Object.keys(openapi.components.securitySchemes))
let checkedResponses = 0
let responsesWithSchema = 0
let noBodyResponses = 0

function checkOperation(path: string, method: string, operation: ApiOperation) {
  const label = `${method.toUpperCase()} ${path}`

  if (!operation.operationId) fail(`${label}: missing operationId`)
  else if (operationIds.has(operation.operationId)) {
    fail(`${label}: duplicate operationId "${operation.operationId}"`)
  } else operationIds.add(operation.operationId)

  if (!operation.summary) fail(`${label}: missing summary`)
  if (!operation.tags?.length) fail(`${label}: missing tags`)
  for (const tag of operation.tags ?? []) {
    if (!tagNames.has(tag)) fail(`${label}: unknown tag "${tag}"`)
  }

  const responses = Object.entries(operation.responses ?? {})
  if (!responses.length) fail(`${label}: no responses`)
  const hasSuccess = responses.some(([status]) => /^[23]/.test(status))
  if (!hasSuccess) fail(`${label}: no 2xx/3xx response`)

  for (const [status, response] of responses) {
    const resolved =
      "$ref" in response
        ? (resolvePointer(response.$ref) as ApiResponse | undefined)
        : response
    checkedResponses++
    if (!resolved || typeof resolved !== "object") {
      fail(`${label}: response ${status} does not resolve`)
      continue
    }
    if ("$ref" in resolved) {
      fail(`${label}: response ${status} has an unresolved $ref`)
      continue
    }
    if (!resolved.description) {
      fail(`${label}: response ${status} has no description`)
    }

    const content = resolved.content
    // Redirects and 204/205/304 are the only responses allowed to omit a body.
    const noBody =
      /^3\d\d$/.test(status) || ["204", "205", "304"].includes(status)
    if (!content) {
      if (noBody) noBodyResponses++
      else fail(`${label}: response ${status} has no content`)
      continue
    }
    // Health probes return their own small payloads, including a 503 body.
    const isHealth = path.startsWith("/api/health/")
    if (
      !isHealth &&
      Number(status) >= 400 &&
      !content["application/problem+json"]
    ) {
      fail(
        `${label}: error response ${status} must use application/problem+json`,
      )
    }

    let hasSchema = false
    for (const mediaType of Object.keys(content)) {
      const media = content[mediaType]
      if (!media?.schema) {
        fail(`${label}: response ${status} ${mediaType} has no schema`)
      } else {
        hasSchema = true
      }
    }
    if (hasSchema) responsesWithSchema++
  }

  if (operation.requestBody) {
    const media = operation.requestBody.content?.["application/json"]
    if (!media?.schema) {
      fail(`${label}: requestBody has no application/json schema`)
    }
  }

  const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map(
    (match) => match[1],
  )
  const pathParams = (operation.parameters ?? []).filter(
    (parameter) => parameter.in === "path",
  )
  for (const name of placeholders) {
    const parameter = pathParams.find((item) => item.name === name)
    if (!parameter) fail(`${label}: missing path parameter "${name}"`)
    else if (!parameter.required) {
      fail(`${label}: path parameter "${name}" must be required`)
    }
  }
  for (const parameter of pathParams) {
    if (!placeholders.includes(parameter.name)) {
      fail(`${label}: declares unused path parameter "${parameter.name}"`)
    }
  }

  for (const requirement of operation.security ?? []) {
    for (const scheme of Object.keys(requirement)) {
      if (!securitySchemes.has(scheme)) {
        fail(`${label}: unknown security scheme "${scheme}"`)
      }
    }
  }
}

for (const [path, methods] of Object.entries(openapi.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    checkOperation(path, method, operation)
  }
}

let refCount = 0
let refErrors = 0

function walk(value: unknown, pointer: string) {
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      walk(entry, `${pointer}/${index}`)
    }
    return
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "$ref" && typeof entry === "string") {
      refCount++
      if (!resolvePointer(entry)) {
        refErrors++
        fail(`Broken $ref at ${pointer}: ${entry}`)
      }
      continue
    }
    walk(entry, `${pointer}/${key}`)
  }
}

walk(openapi, "#")

/* -------------------------------------------------------------------------- */
/* summary                                                                    */
/* -------------------------------------------------------------------------- */

const operationCount = Object.values(openapi.paths).reduce(
  (count, methods) => count + Object.keys(methods).length,
  0,
)
const schemaCount = Object.keys(openapi.components.schemas).length

if (openapi.openapi !== "3.1.0") {
  fail(`Expected OpenAPI 3.1.0, found ${openapi.openapi}`)
}
if (!openapi.info.title || !openapi.info.version) {
  fail("info.title and info.version are required")
}
if (operationCount !== checkedOperations) {
  // This is expected only if a route is ignored (HEAD/OPTIONS) — surface it
  // as a warning so the counts stay trustworthy.
  warn(
    `Operation count ${operationCount} != checked route handlers ${checkedOperations}`,
  )
}
console.log("OpenAPI check")
console.log(
  `  routes:     ${routeMap.size} paths / ${checkedOperations} handlers`,
)
console.log(
  `  spec:       ${operationCount} operations / ${schemaCount} schemas`,
)
console.log(
  `  responses:  ${responsesWithSchema}/${checkedResponses} with schemas` +
    (noBodyResponses ? ` (${noBodyResponses} no-body)` : ""),
)
console.log(`  refs:       ${refCount} checked, ${refErrors} broken`)

if (warnings.length) {
  console.log("\nWarnings:")
  for (const warning of warnings) console.log(`  - ${warning}`)
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exitCode = 1
} else {
  console.log(
    "\n✓ OpenAPI document matches the route handlers and is structurally valid.",
  )
}
