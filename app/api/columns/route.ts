import { z } from "zod"
import { handler } from "@/lib/api"
import { createColumn, listColumns } from "@/lib/services/columns"

const NewColumnSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  dot: z.string().optional(),
})

export const GET = handler({ run: () => listColumns() })

export const POST = handler({
  schema: NewColumnSchema,
  run: (input) => createColumn(input),
})
