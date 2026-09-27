import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logger"
import { readStoredMedia, verifyMediaGrant } from "@/lib/media"

export const runtime = "nodejs"

export async function GET(
  req: Request,
  route: { params: Promise<{ id: string }> },
) {
  const { id } = await route.params
  const url = new URL(req.url)
  const user = await getSessionUser(req)
  if (!user && !verifyMediaGrant(id, url)) {
    return Response.json(
      { error: { message: "Unauthorized" } },
      { status: 401 },
    )
  }

  const media = await prisma.mediaObject.findUnique({ where: { id } })
  if (!media) return new Response("Not found", { status: 404 })
  try {
    const bytes = await readStoredMedia(media.storageKey)
    const range = req.headers.get("range")
    const baseHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
      "Content-Type": media.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    }
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range)
      if (!match) return new Response(null, { status: 416 })
      const start = Number(match[1])
      const end = match[2] ? Number(match[2]) : bytes.length - 1
      if (start > end || end >= bytes.length) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${bytes.length}` },
        })
      }
      const chunk = bytes.subarray(start, end + 1)
      return new Response(chunk, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(chunk.length),
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        },
      })
    }
    return new Response(bytes, {
      headers: { ...baseHeaders, "Content-Length": String(bytes.length) },
    })
  } catch (error) {
    logError("media.read_failed", error, { mediaId: id })
    return new Response("Media unavailable", { status: 503 })
  }
}
