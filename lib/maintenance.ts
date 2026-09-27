import { prisma } from "./db"
import { log } from "./logger"
import { pruneOrphanedMedia } from "./media"

export async function runMaintenance() {
  const now = new Date()
  const staleLinkCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const [sessions, loginCodes, widgetLinks] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.loginCode.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.widgetLink.deleteMany({
      where: { verifiedAt: null, updatedAt: { lt: staleLinkCutoff } },
    }),
  ])
  const mediaRows = await prisma.mediaObject.findMany({
    select: { storageKey: true },
  })
  const media = await pruneOrphanedMedia(
    new Set(mediaRows.map((row) => row.storageKey)),
  )
  const result = {
    expiredSessions: sessions.count,
    expiredLoginCodes: loginCodes.count,
    staleWidgetLinks: widgetLinks.count,
    orphanedMedia: media.deleted,
    mediaDeleteFailures: media.failed,
  }
  log(media.failed ? "warn" : "info", "maintenance.complete", result)
  return result
}
