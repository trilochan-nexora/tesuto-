import { handler } from "@/lib/api"
import { deleteProject } from "@/lib/services/projects"

export const DELETE = handler({
  run: (_input, { params }) => deleteProject(params.id),
})
