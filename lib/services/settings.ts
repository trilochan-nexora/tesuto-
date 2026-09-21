import { HttpError } from "@/lib/api"
import { prisma } from "@/lib/db"

/**
 * Workspace-level toggles, stored as a tiny key/value table. Rows are absent
 * until someone flips a switch, and absent means "on" — integrations ship
 * enabled (subject to their env vars) and can be turned off in Settings.
 */

export const INTEGRATION_KEYS = [
  "integration.slack",
  "integration.email",
  "integration.github_sync",
  "integration.github_projects_import",
  "integration.clickup_import",
  "integration.hearth_releases",
] as const

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number]

export const INTEGRATION_KEYS_SET = new Set<string>(INTEGRATION_KEYS)

export async function getSetting(key: string): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return row ? row.value === "true" : true
}

export async function setSetting(key: IntegrationKey, enabled: boolean) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: String(enabled) },
    update: { value: String(enabled) },
  })
  return { key, enabled }
}

/** Throws 403 unless the integration toggle is on. */
export async function requireIntegration(key: IntegrationKey, label: string) {
  if (!(await getSetting(key))) {
    throw new HttpError(
      `${label} is disabled — enable it in Settings → Integrations`,
      403,
    )
  }
}
