import "swagger-ui-dist/swagger-ui.css"
import type { Metadata } from "next"
import { SwaggerUI } from "@/components/swagger-ui"

export const metadata: Metadata = {
  title: "Tesuto API docs",
  description:
    "Interactive OpenAPI 3.1 reference for the Tesuto dashboard and widget API.",
}

export default function SwaggerPage() {
  return (
    <main className="swagger-page min-h-screen bg-white">
      <SwaggerUI />
    </main>
  )
}
