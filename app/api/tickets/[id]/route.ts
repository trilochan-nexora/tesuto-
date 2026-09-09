import { z } from "zod"
import { handler } from "@/lib/api"
import { zAnnotation, zPriority, zType } from "@/lib/schemas"
import { deleteTickets, getTicket, patchTicket } from "@/lib/services/tickets"

const PatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: zPriority.optional(),
  type: zType.optional(),
  assigneeId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().optional(),
  githubIssueUrl: z.string().nullable().optional(),
  annotations: z.array(zAnnotation).nullable().optional(),
})

export const GET = handler({
  run: (_input, { params }) => getTicket(params.id),
})

export const PATCH = handler({
  schema: PatchSchema,
  run: (input, { params, user }) => patchTicket(params.id, input, user.id),
})

export const DELETE = handler({
  run: (_input, { params }) => deleteTickets([params.id]),
})
