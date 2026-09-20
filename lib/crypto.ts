import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { appSecret } from "./env"

/**
 * Encrypts the GitHub OAuth token before it lands in Postgres. AES-256-GCM
 * with a key derived from APP_SECRET; format is `iv.tag.ciphertext` (base64url).
 */
export function encryptToken(token: string): string {
  const secret = appSecret()
  if (!secret) throw new Error("Missing env var APP_SECRET")
  const key = createHash("sha256").update(secret).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".")
}

export function decryptToken(payload: string): string {
  const secret = appSecret()
  if (!secret) throw new Error("Missing env var APP_SECRET")
  const key = createHash("sha256").update(secret).digest()
  const [iv, tag, data] = payload.split(".")
  if (!iv || !tag || !data) throw new Error("Malformed encrypted token")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
