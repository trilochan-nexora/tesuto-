import { openapi } from "@/lib/openapi"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export function GET() {
  return Response.json(openapi, {
    headers: {
      ...corsHeaders,
      // The spec changes with every deploy; never let a browser or CDN pin an
      // older contract after the server has moved on.
      "Cache-Control": "no-store",
    },
  })
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Max-Age": "86400",
    },
  })
}
