import { z } from "zod"
import { handler } from "@/lib/api"
import {
  zAnnotation,
  zDescription,
  zId,
  zPriority,
  zTitle,
  zType,
} from "@/lib/schemas"
import { deleteTickets, getTicket, patchTicket } from "@/lib/services/tickets"

const PatchSchema = z.object({
  title: zTitle.optional(),
  description: zDescription.nullable().optional(),
  status: zId.optional(),
  priority: zPriority.optional(),
  type: zType.optional(),
  assigneeId: zId.nullable().optional(),
  parentId: zId.nullable().optional(),
  order: z.number().finite().optional(),
  annotations: z.array(zAnnotation).max(200).nullable().optional(),
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
