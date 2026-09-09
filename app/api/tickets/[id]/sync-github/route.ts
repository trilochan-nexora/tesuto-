import { handler } from "@/lib/api"
import { syncTicketToGithub } from "@/lib/services/tickets"

export const POST = handler({
  run: (_input, { params, user }) => syncTicketToGithub(params.id, user.id),
})
