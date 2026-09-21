import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises"
import { join, resolve } from "node:path"
import { appSecret } from "./env"

export type MediaKind = "screenshot" | "recording"

export type PreparedMedia = {
  id: string
  storageKey: string
  kind: MediaKind
  mimeType: string
  size: number
  ticketId: string
  url: string
}

const TYPES: Record<string, { extension: string; kind: MediaKind }> = {
  "image/png": { extension: "png", kind: "screenshot" },
  "image/jpeg": { extension: "jpg", kind: "screenshot" },
  "image/webp": { extension: "webp", kind: "screenshot" },
  "video/webm": { extension: "webm", kind: "recording" },
  "video/mp4": { extension: "mp4", kind: "recording" },
}

export function mediaRoot() {
  const configured = process.env.MEDIA_STORAGE_DIR?.trim()
  if (process.env.NODE_ENV === "production" && !configured) {
    throw new Error("Missing env var MEDIA_STORAGE_DIR")
  }
  return resolve(configured || join(process.cwd(), ".data", "media"))
}

export async function ensureMediaStorage() {
  const root = mediaRoot()
  await mkdir(root, { recursive: true })
  await stat(root)
  return root
}

export function mediaUrl(id: string) {
  return `/api/media/${encodeURIComponent(id)}`
}

export async function prepareMedia(
  dataUrl: string | undefined,
  expectedKind: MediaKind,
  ticketId: string,
): Promise<PreparedMedia | null> {
  if (!dataUrl) return null
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new Error("Malformed media data")
  const mimeType = match[1]
  const config = TYPES[mimeType]
  if (!config || config.kind !== expectedKind) {
    throw new Error(`Unsupported ${expectedKind} format`)
  }
  const bytes = Buffer.from(match[2], "base64")
  const maxBytes = expectedKind === "screenshot" ? 6_000_000 : 11_000_000
  if (!bytes.length || bytes.length > maxBytes) {
    throw new Error(`${expectedKind} is too large`)
  }

  const root = await ensureMediaStorage()
  const id = randomBytes(24).toString("base64url")
  const storageKey = `${id}.${config.extension}`
  const target = join(root, storageKey)
  const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 })
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
  return {
    id,
    storageKey,
    kind: expectedKind,
    mimeType,
    size: bytes.length,
    ticketId,
    url: mediaUrl(id),
  }
}

export async function deleteStoredMedia(rows: Array<{ storageKey: string }>) {
  const root = mediaRoot()
  await Promise.all(
    rows.map((row) => unlink(join(root, row.storageKey)).catch(() => {})),
  )
}

export async function readStoredMedia(storageKey: string) {
  if (!/^[A-Za-z0-9_-]+\.(?:png|jpg|webp|webm|mp4)$/.test(storageKey)) {
    throw new Error("Invalid media key")
  }
  return readFile(join(mediaRoot(), storageKey))
}

/**
 * Removes abandoned uploads and stale temp files. A grace period prevents a
 * cleanup run racing an upload between its atomic file write and DB commit.
 */
export async function pruneOrphanedMedia(
  activeStorageKeys: ReadonlySet<string>,
  graceMs = 60 * 60 * 1000,
) {
  const root = await ensureMediaStorage()
  const entries = await readdir(root, { withFileTypes: true })
  const cutoff = Date.now() - graceMs
  let deleted = 0
  let failed = 0

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) return
      const isMedia = /^[A-Za-z0-9_-]+\.(?:png|jpg|webp|webm|mp4)$/.test(
        entry.name,
      )
      const isTemporary = entry.name.endsWith(".tmp")
      if ((!isMedia && !isTemporary) || activeStorageKeys.has(entry.name)) {
        return
      }
      const target = join(root, entry.name)
      try {
        const details = await stat(target)
        if (details.mtimeMs >= cutoff) return
        await unlink(target)
        deleted++
      } catch {
        failed++
      }
    }),
  )
  return { deleted, failed }
}

function grantSignature(id: string, expires: number) {
  const secret = appSecret()
  if (!secret) throw new Error("APP_SECRET is not configured")
  return createHmac("sha256", secret)
    .update(`${id}:${expires}`)
    .digest("base64url")
}

export function signedMediaUrl(req: Request, value: string | null) {
  if (!value?.startsWith("/api/media/")) return value
  const id = value.slice("/api/media/".length)
  const expires = Math.floor(Date.now() / 1000) + 15 * 60
  const url = new URL(value, new URL(req.url).origin)
  url.searchParams.set("expires", String(expires))
  url.searchParams.set("signature", grantSignature(id, expires))
  return url.toString()
}

export function verifyMediaGrant(id: string, url: URL) {
  const expires = Number(url.searchParams.get("expires"))
  const signature = url.searchParams.get("signature") ?? ""
  const now = Math.floor(Date.now() / 1000)
  if (
    !Number.isSafeInteger(expires) ||
    expires < now ||
    expires > now + 16 * 60
  ) {
    return false
  }
  const expected = grantSignature(id, expires)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}
