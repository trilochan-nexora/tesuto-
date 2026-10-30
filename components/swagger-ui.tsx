"use client"

import { useEffect, useRef, useState } from "react"

type SwaggerUIInstance = { destroy?: () => void }

/**
 * Self-hosted Swagger UI.
 * The spec comes from /swagger/json, so there is no second copy to maintain
 * and "Try it out" hits this origin with the browser's existing session cookie.
 */
export function SwaggerUI() {
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    let ui: SwaggerUIInstance | null = null

    async function mount() {
      try {
        const mod = await import("swagger-ui-dist/swagger-ui-bundle.js")
        if (cancelled || !container.current) return
        const SwaggerUIBundle = mod.default
        ui = SwaggerUIBundle({
          url: "/swagger/json",
          domNode: container.current,
          deepLinking: true,
          displayRequestDuration: true,
          persistAuthorization: true,
          // Start as a scannable index: tags collapsed, forms read-only until
          // "Try it out", and no raw schema dump at the bottom.
          docExpansion: "none",
          defaultModelsExpandDepth: -1,
          tryItOutEnabled: false,
          filter: true,
          presets: [SwaggerUIBundle.presets.apis],
          layout: "BaseLayout",
        })
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load Swagger UI.",
          )
        }
      }
    }

    void mount()
    return () => {
      cancelled = true
      ui?.destroy?.()
    }
  }, [])

  return (
    <div>
      {error ? (
        <p className="mx-auto max-w-3xl px-6 py-10 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      <div ref={container} />
    </div>
  )
}
