import { z } from "zod"
import { handler } from "@/lib/api"
import { reorderColumns } from "@/lib/services/columns"

const ReorderSchema = z.object({ ids: z.array(z.string()).min(1) })

export const POST = handler({
  schema: ReorderSchema,
  run: (input) => reorderColumns(input.ids),
})
