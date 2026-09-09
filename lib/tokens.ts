/** Publishable project token the embedded widget presents (`tsto_pk_…`). */
export function makeProjectToken() {
  const rand =
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  return `tsto_pk_${rand}`
}
