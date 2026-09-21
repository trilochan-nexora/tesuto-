import { z } from "zod"
import { handler } from "@/lib/api"
import { deleteProject, updateProject } from "@/lib/services/projects"

const ProjectPatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(2_000).optional(),
  githubRepo: z.string().trim().max(200).nullable().optional(),
})

export const PATCH = handler({
  schema: ProjectPatchSchema,
  run: (input, { params }) => updateProject(params.id, input),
})

export const DELETE = handler({
  run: (_input, { params }) => deleteProject(params.id),
})
