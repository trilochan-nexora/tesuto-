import { z } from "zod"
import { handler } from "@/lib/api"
import { deleteProject, updateProject } from "@/lib/services/projects"

const ProjectPatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  githubRepo: z.string().nullable().optional(),
})

export const PATCH = handler({
  schema: ProjectPatchSchema,
  run: (input, { params }) => updateProject(params.id, input),
})

export const DELETE = handler({
  run: (_input, { params }) => deleteProject(params.id),
})
