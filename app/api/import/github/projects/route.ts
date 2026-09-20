import { handler } from "@/lib/api"
import { listGithubProjects } from "@/lib/providers/github-projects"
import { requireIntegration } from "@/lib/services/settings"
import { connectedGithubToken } from "@/lib/services/users"

/**
 * Boards the connected GitHub account can see, for the import picker. Needs a
 * linked account in Settings and the GitHub Projects import toggle on.
 */
export const GET = handler({
  run: async (_input, { user }) => {
    await requireIntegration(
      "integration.github_projects_import",
      "GitHub Projects import",
    )
    const token = await connectedGithubToken(user.id)
    return listGithubProjects(token)
  },
})
