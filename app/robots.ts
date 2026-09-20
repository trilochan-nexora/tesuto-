import type { MetadataRoute } from "next"

const baseUrl = process.env.APP_URL ?? "https://tesuto.madebynexora.com"

// Only the marketing page and the public widget demo are worth indexing —
// everything else sits behind sign-in and returns the same content to every
// crawler anyway.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/widget"],
      disallow: [
        "/api/",
        "/inbox",
        "/board",
        "/projects",
        "/sprints",
        "/team",
        "/settings",
        "/profile",
        "/analytics",
        "/tickets/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
