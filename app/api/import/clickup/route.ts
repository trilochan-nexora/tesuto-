import { z } from "zod"
import { HttpError, handler } from "@/lib/api"
import { clickupTasks } from "@/lib/providers/clickup"
import { importProject } from "@/lib/services/projects"
import { requireIntegration } from "@/lib/services/settings"

const ImportSchema = z.object({
  token: z.string().min(10),
  listId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
})

/**
 * Pulls one ClickUp list and creates a Tesuto project from it. The token is
 * used only for this request. Closed tasks arrive resolved; priorities map
 * urgent/high/normal/low.
 */
export const POST = handler({
  schema: ImportSchema,
  run: async (input, { user }) => {
    await requireIntegration("integration.clickup_import", "ClickUp import")
    const tasks = await clickupTasks(input.token, input.listId)
    if (!tasks.length) {
      throw new HttpError("That list has no tasks to import", 422)
    }
    const issues = tasks.map((t) => ({
      title: t.title,
      body: t.body,
      type: "task" as const,
      priority: t.priority,
      resolved: t.resolved,
    }))
    return importProject(
      {
        name: input.name,
        description: input.description ?? "Imported from ClickUp",
        source: "clickup",
        issues,
      },
      user.id,
    )
  },
})
