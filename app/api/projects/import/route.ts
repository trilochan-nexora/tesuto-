import { z } from "zod"
import { handler } from "@/lib/api"
import { zPriority, zType } from "@/lib/schemas"
import { importProject } from "@/lib/services/projects"

const ImportSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2_000).default(""),
  source: z.string().max(200),
  issues: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        body: z.string().max(50_000).optional(),
        type: zType,
        priority: zPriority,
        resolved: z.boolean(),
      }),
    )
    .max(1_000),
})

export const POST = handler({
  schema: ImportSchema,
  run: (input, { user }) => importProject(input, user.id),
})
