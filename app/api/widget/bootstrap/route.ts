import { widgetRoute } from "@/lib/api"
import { widgetBootstrap } from "@/lib/services/widget"

export function OPTIONS() {
  return new Response(null, { status: 204 })
}

export const GET = widgetRoute((req) => widgetBootstrap(req))
