import type { MetadataRoute } from "next"

const baseUrl = process.env.APP_URL ?? "https://tesuto.madebynexora.com"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: baseUrl, changeFrequency: "monthly", priority: 1 },
    { url: `${baseUrl}/widget`, changeFrequency: "monthly", priority: 0.5 },
  ]
}
