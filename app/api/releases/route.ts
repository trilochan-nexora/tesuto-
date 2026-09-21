import { timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { HttpError, handler } from "@/lib/api"
import { prisma } from "@/lib/db"
import { releasesWebhookSecret } from "@/lib/env"
import { requireIntegration } from "@/lib/services/settings"

const ReleaseSchema = z.object({
  version: z.string().min(1),
  repo: z.string().min(1),
  notesMd: z.string().min(1),
  releaseUrl: z.string().url(),
  /** When the release actually shipped. Defaults to now — only backfill
   *  (historical releases from before this endpoint existed) needs to set
   *  this explicitly so /releases sorts them correctly. */
  releasedAt: z.string().datetime().optional(),
})

function verifyReleaseSecret(req: Request) {
  const secret = releasesWebhookSecret()
  const got = req.headers.get("x-release-secret") ?? ""
  if (!secret || !got) return false
  const want = Buffer.from(secret)
  const gotBuf = Buffer.from(got)
  return want.length === gotBuf.length && timingSafeEqual(want, gotBuf)
}

/** Hearth's `api-release-prod.yml` posts here after a real prod API release. */
export const POST = handler({
  schema: ReleaseSchema,
  auth: false,
  run: async (input, { req }) => {
    if (!verifyReleaseSecret(req)) throw new HttpError("Unauthorized", 401)
    const { releasedAt, ...rest } = input
    return prisma.release.create({
      data: { ...rest, ...(releasedAt ? { createdAt: releasedAt } : {}) },
    })
  },
})

export const GET = handler({
  run: async () => {
    await requireIntegration(
      "integration.hearth_releases",
      "Hearth release notes",
    )
    return prisma.release.findMany({ orderBy: { createdAt: "desc" } })
  },
})
