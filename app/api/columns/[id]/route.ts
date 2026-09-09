import { z } from "zod"
import { HttpError, handler } from "@/lib/api"
import { removeColumn, updateColumn } from "@/lib/services/columns"

const PatchSchema = z.object({
  label: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  dot: z.string().optional(),
  terminal: z.boolean().optional(),
  limit: z.number().nullable().optional(),
})

const DeleteSchema = z.object({ reassignTo: z.string().min(1) })

export const PATCH = handler({
  schema: PatchSchema,
  run: (input, { params }) => updateColumn(params.id, input),
})

export const DELETE = handler({
  schema: DeleteSchema,
  run: (input, { params }) => {
    if (!input.reassignTo) throw new HttpError("reassignTo is required", 422)
    return removeColumn(params.id, input.reassignTo)
  },
})
