import { randomBytes } from "node:crypto"

/** Publishable project token the embedded widget presents (`tsto_pk_…`). */
export function makeProjectToken() {
  return `tsto_pk_${randomBytes(24).toString("base64url")}`
}
