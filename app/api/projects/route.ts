import { z } from "zod"
import { handler } from "@/lib/api"
import { createProject, listProjects } from "@/lib/services/projects"

const NewProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
})

export const GET = handler({ run: () => listProjects() })

export const POST = handler({
  schema: NewProjectSchema,
  run: (input) => createProject(input),
})
