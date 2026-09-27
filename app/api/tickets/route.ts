import { z } from "zod"
import { handler } from "@/lib/api"
import {
  zAnnotation,
  zContext,
  zDescription,
  zDomSnapshot,
  zHttpUrl,
  zId,
  zPriority,
  zRecording,
  zScreenshot,
  zTitle,
  zType,
} from "@/lib/schemas"
import { createTicket, listTickets } from "@/lib/services/tickets"

const FiltersSchema = z.object({
  projectId: zId.optional(),
  status: zId.optional(),
  assigneeId: zId.optional(),
  parentId: zId.optional(),
})

const NewTicketSchema = z.object({
  title: zTitle,
  description: zDescription.optional(),
  projectId: zId,
  priority: zPriority,
  type: zType,
  assigneeId: zId.optional(),
  parentId: zId.optional(),
  status: zId.optional(),
  sourceUrl: zHttpUrl.optional(),
  screenshotUrl: zScreenshot.optional(),
  recordingUrl: zRecording.optional(),
  annotations: z.array(zAnnotation).max(200).optional(),
  domSnapshot: zDomSnapshot.optional(),
  context: zContext.optional(),
})

export const GET = handler({
  schema: FiltersSchema,
  run: (input) => listTickets(input),
})

export const POST = handler({
  schema: NewTicketSchema,
  run: (input, { user }) => createTicket(input, user.id),
})
