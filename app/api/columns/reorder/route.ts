import { z } from "zod"
import { handler } from "@/lib/api"
import { reorderColumns } from "@/lib/services/columns"

const ReorderSchema = z.object({
  projectId: z.string().min(1).max(128),
  ids: z.array(z.string().min(1).max(128)).min(1).max(100),
})

export const POST = handler({
  schema: ReorderSchema,
  run: (input) => reorderColumns(input.projectId, input.ids),
})
