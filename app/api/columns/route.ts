import { z } from "zod"
import { handler } from "@/lib/api"
import { createColumn, listColumns } from "@/lib/services/columns"

const ListColumnsSchema = z.object({
  projectId: z.string().min(1).max(128).optional(),
})

const NewColumnSchema = z.object({
  projectId: z.string().min(1).max(128),
  label: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  dot: z.string().max(32).optional(),
})

export const GET = handler({
  schema: ListColumnsSchema,
  // No projectId = every column across every project, for bootstrap-style
  // full-list loads; the store keeps one flat list and filters client-side,
  // same as it does for tickets.
  run: (input) => listColumns(input.projectId),
})

export const POST = handler({
  schema: NewColumnSchema,
  run: (input) => createColumn(input.projectId, input),
})
