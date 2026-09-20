import { z } from "zod"
import { handler } from "@/lib/api"
import { clickupLists } from "@/lib/providers/clickup"
import { requireIntegration } from "@/lib/services/settings"

const schema = z.object({
  token: z.string().min(10),
  teamId: z.string().min(1),
})

/** All lists (folderless + inside folders) of a ClickUp workspace. */
export const POST = handler({
  schema,
  run: async (input) => {
    await requireIntegration("integration.clickup_import", "ClickUp import")
    return clickupLists(input.token, input.teamId)
  },
})
