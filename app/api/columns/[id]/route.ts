import { z } from "zod"
import { HttpError, handler } from "@/lib/api"
import { removeColumn, updateColumn } from "@/lib/services/columns"

const PatchSchema = z.object({
  projectId: z.string().min(1).max(128),
  label: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  dot: z.string().max(32).optional(),
  terminal: z.boolean().optional(),
  limit: z.number().nullable().optional(),
})

const DeleteSchema = z.object({
  projectId: z.string().min(1).max(128),
  reassignTo: z.string().min(1).max(128),
})

export const PATCH = handler({
  schema: PatchSchema,
  run: ({ projectId, ...patch }, { params }) =>
    updateColumn(projectId, params.id, patch),
})

export const DELETE = handler({
  schema: DeleteSchema,
  run: (input, { params }) => {
    if (!input.reassignTo) throw new HttpError("reassignTo is required", 422)
    return removeColumn(input.projectId, params.id, input.reassignTo)
  },
})
