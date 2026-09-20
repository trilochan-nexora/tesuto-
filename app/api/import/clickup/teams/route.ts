import { z } from "zod"
import { handler } from "@/lib/api"
import { clickupTeams } from "@/lib/providers/clickup"
import { requireIntegration } from "@/lib/services/settings"

const schema = z.object({ token: z.string().min(10) })

/** Workspaces visible to the pasted token (never stored). */
export const POST = handler({
  schema,
  run: async (input) => {
    await requireIntegration("integration.clickup_import", "ClickUp import")
    return clickupTeams(input.token)
  },
})
