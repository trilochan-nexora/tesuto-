import { z } from "zod"
import { handler } from "@/lib/api"
import { zPriority, zType } from "@/lib/schemas"
import { importProject } from "@/lib/services/projects"

const ImportSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  source: z.string(),
  issues: z.array(
    z.object({
      title: z.string().min(1),
      body: z.string().optional(),
      type: zType,
      priority: zPriority,
      resolved: z.boolean(),
    }),
  ),
})

export const POST = handler({
  schema: ImportSchema,
  run: (input, { user }) => importProject(input, user.id),
})
