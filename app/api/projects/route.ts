import { z } from "zod"
import { handler } from "@/lib/api"
import { createProject, listProjects } from "@/lib/services/projects"

const NewProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2_000).default(""),
})

export const GET = handler({ run: () => listProjects() })

export const POST = handler({
  schema: NewProjectSchema,
  run: (input) => createProject(input),
})
