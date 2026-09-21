import { z } from "zod"
import { HttpError, handler } from "@/lib/api"
import { listGithubItems } from "@/lib/providers/github-projects"
import { importProject } from "@/lib/services/projects"
import { requireIntegration } from "@/lib/services/settings"
import { connectedGithubToken } from "@/lib/services/users"

const ImportSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
})

/**
 * Pulls one GitHub Projects (v2) board and creates a Tesuto project from it.
 * Items import as tasks, priority medium; closed/merged items start resolved.
 */
export const POST = handler({
  schema: ImportSchema,
  run: async (input, { user }) => {
    await requireIntegration(
      "integration.github_projects_import",
      "GitHub Projects import",
    )
    const token = await connectedGithubToken(user.id)
    const { title, columns, items } = await listGithubItems(
      token,
      input.projectId,
    )
    if (!items.length) {
      throw new HttpError("That board has no items to import", 422)
    }
    const name = input.name ?? title
    if (!name) throw new HttpError("Couldn't read the board title", 502)
    const issues = items.map((i) => ({
      title: i.title,
      body: i.body,
      type: "task" as const,
      priority: "medium" as const,
      resolved: i.resolved,
      status: i.status,
    }))
    return importProject(
      {
        name,
        description:
          input.description ?? `Imported from GitHub Projects “${title}”`,
        source: "github-projects",
        issues,
        columns,
      },
      user.id,
    )
  },
})
