declare module "swagger-ui-dist/swagger-ui-bundle.js" {
  type SwaggerUIInstance = {
    destroy?: () => void
  }

  type SwaggerUIBundle = {
    (options: Record<string, unknown>): SwaggerUIInstance
    presets: { apis: unknown }
  }

  const bundle: SwaggerUIBundle
  export default bundle
}
