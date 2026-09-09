import { z } from "zod"
import { HttpError, handler } from "@/lib/api"
import { bulkMove, deleteTickets } from "@/lib/services/tickets"

const BulkSchema = z.object({
  action: z.enum(["move", "delete"]),
  ids: z.array(z.string()).min(1),
  status: z.string().optional(),
})

export const POST = handler({
  schema: BulkSchema,
  run: (input, { user }) => {
    if (input.action === "delete") return deleteTickets(input.ids)
    if (!input.status) throw new HttpError("status is required for move", 422)
    return bulkMove(input.ids, input.status, user.id)
  },
})
