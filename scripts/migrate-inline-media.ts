/**
 * One-time backfill: moves screenshots/recordings still stored inline as
 * base64 `data:` URLs on tickets into media storage, like new uploads.
 * Inline blobs made /api/bootstrap multi-megabyte (it ships every ticket).
 *
 * Idempotent — only touches rows whose URL still starts with `data:`.
 *
 *   bun run media:migrate
 */
import {
  deleteStoredMedia,
  type PreparedMedia,
  prepareMedia,
} from "@/lib/media"
import { prisma } from "@/lib/db"

async function main() {
  const rows = await prisma.ticket.findMany({
    where: {
      OR: [
        { screenshotUrl: { startsWith: "data:" } },
        { recordingUrl: { startsWith: "data:" } },
      ],
    },
    select: { id: true, key: true, screenshotUrl: true, recordingUrl: true },
  })

  let moved = 0
  let failed = 0
  for (const t of rows) {
    const media: PreparedMedia[] = []
    try {
      const shot = t.screenshotUrl?.startsWith("data:")
        ? await prepareMedia(t.screenshotUrl, "screenshot", t.id)
        : null
      if (shot) media.push(shot)
      const rec = t.recordingUrl?.startsWith("data:")
        ? await prepareMedia(t.recordingUrl, "recording", t.id)
        : null
      if (rec) media.push(rec)

      await prisma.$transaction([
        prisma.mediaObject.createMany({
          data: media.map(({ url: _url, ...item }) => item),
        }),
        prisma.ticket.update({
          where: { id: t.id },
          data: {
            ...(shot ? { screenshotUrl: shot.url } : {}),
            ...(rec ? { recordingUrl: rec.url } : {}),
          },
        }),
      ])
      moved++
    } catch (error) {
      // A malformed legacy blob leaves that ticket untouched, not half-migrated.
      await deleteStoredMedia(media)
      failed++
      console.error(`[media:migrate] ${t.key}:`, (error as Error).message)
    }
  }

  console.log(
    `[media:migrate] ${rows.length} ticket(s) with inline media — moved ${moved}, failed ${failed}`,
  )
  await prisma.$disconnect()
}

void main()
