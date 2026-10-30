import { problem } from "@/lib/api"
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
    return problem({
      status: 401,
      code: "UNAUTHORIZED",
      detail: "Unauthorized",
      req,
    })
  }

  const media = await prisma.mediaObject.findUnique({ where: { id } })
  if (!media) {
    return problem({
      status: 404,
      code: "NOT_FOUND",
      detail: "Media not found",
      req,
    })
  }
  try {
    const bytes = await readStoredMedia(media.storageKey)
    const range = req.headers.get("range")
    const requestedName = url.searchParams.get("download")
    const downloadName = requestedName
      ? requestedName
          .replace(/["\\/]/g, "_")
          .split("")
          .map((character) => {
            const code = character.charCodeAt(0)
            return code < 32 || code === 127 ? "_" : character
          })
          .join("")
          .slice(0, 120)
      : undefined
    const baseHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
      "Content-Type": media.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      ...(downloadName
        ? {
            "Content-Disposition": `attachment; filename="${downloadName}"`,
          }
        : {}),
    }
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range)
      if (!match) {
        return problem({
          status: 416,
          code: "RANGE_NOT_SATISFIABLE",
          detail: "Invalid range",
          req,
          headers: { "Content-Range": `bytes */${bytes.length}` },
        })
      }
      const start = Number(match[1])
      const end = match[2] ? Number(match[2]) : bytes.length - 1
      if (start > end || end >= bytes.length) {
        return problem({
          status: 416,
          code: "RANGE_NOT_SATISFIABLE",
          detail: "Invalid range",
          req,
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
    return problem({
      status: 503,
      code: "MEDIA_UNAVAILABLE",
      detail: "Media unavailable",
      req,
    })
  }
}
