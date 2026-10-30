/**
 * Email delivery check.
 *
 *   bun run email:check
 *   bun run email:check --to you@example.com
 *
 * Sends through `sendAuthEmail()` — the same strict path email sign-in uses —
 * so it fails loudly instead of silently skipping like the notification path.
 *
 * This proves Resend accepted the message. It does not prove inbox placement:
 * use a real recipient with `--to` for that. `delivered@resend.dev` is Resend's
 * test sink and always accepts.
 */

import { appSecret, emailFrom, resendApiKey } from "../lib/env"
import { sendAuthEmail } from "../lib/notify"
import { getSetting } from "../lib/services/settings"

function argument(name: string) {
  const index = process.argv.indexOf(name)
  if (index === -1) return ""
  return process.argv[index + 1]?.trim() ?? ""
}

const to =
  argument("--to") ||
  process.env.EMAIL_CHECK_TO?.trim() ||
  "delivered@resend.dev"
const subject = argument("--subject") || "Tesuto email check"

const checks: { label: string; ok: boolean; detail: string }[] = []

function check(label: string, ok: boolean, detail: string) {
  checks.push({ label, ok, detail })
}

async function main() {
  const key = resendApiKey()
  const from = emailFrom()

  check(
    "RESEND_API_KEY",
    Boolean(key),
    key ? `set (${key.slice(0, 6)}…, ${key.length} chars)` : "missing",
  )
  check("EMAIL_FROM", Boolean(from), from || "missing")
  check(
    "APP_SECRET",
    Boolean(appSecret()),
    appSecret()
      ? "accepted for the current NODE_ENV"
      : process.env.NODE_ENV === "production"
        ? "REJECTED — placeholder or shorter than 32 chars; auth mail returns 503 in production"
        : "empty (allowed in development only)",
  )
  check("recipient", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to), to || "missing")

  try {
    const enabled = await getSetting("integration.email")
    check(
      "integration.email",
      enabled,
      enabled
        ? "on (notification email can send)"
        : "off — notification email is skipped; auth mail is unaffected",
    )
  } catch (error) {
    check(
      "integration.email",
      false,
      `could not read Setting table: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  for (const row of checks) {
    console.log(
      `${row.ok ? "ok  " : "FAIL"} ${row.label.padEnd(30)} ${row.detail}`,
    )
  }

  const hardFailures = checks.filter(
    (row) =>
      !row.ok &&
      (["RESEND_API_KEY", "EMAIL_FROM", "recipient"].includes(row.label) ||
        (row.label === "APP_SECRET" && process.env.NODE_ENV === "production")),
  )
  if (hardFailures.length) {
    console.error("\nEmail is not configured; refusing to send.")
    process.exit(1)
  }

  console.log(`\nSending "${subject}" to ${to} …`)
  try {
    await sendAuthEmail(
      to,
      subject,
      `<p>Tesuto email check at ${new Date().toISOString()}.</p><p>If you can read this, Resend accepted the message.</p>`,
    )
    console.log("ok   Resend accepted the message.")
    console.log(
      "\nNote: notification emails only go to an active assignee who is not the actor.",
    )
    console.log(
      "Auth mail requires a valid APP_SECRET in production (the check above reports it).",
    )
  } catch (error) {
    console.error(
      `\nFAIL sendAuthEmail: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
}

void main()
