import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // tesuto is its own project nested in the hearth working tree
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=(self)",
      },
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains",
            },
          ]
        : []),
    ]
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // The embeddable widget must be loadable from any origin.
        source: "/:file(widget.js|tesuto-widget.js)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=60" },
        ],
      },
      {
        // The widget files issues cross-origin with a project bearer token
        // (no cookie), so `*` is safe here.
        source: "/api/widget/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PATCH,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Authorization,Content-Type,X-Tesuto-Project",
          },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ]
  },
}

export default nextConfig
