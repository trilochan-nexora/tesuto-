import { z } from "zod"
import { handler } from "@/lib/api"
import {
  zAnnotation,
  zContext,
  zDomSnapshot,
  zPriority,
  zRecording,
  zScreenshot,
  zType,
} from "@/lib/schemas"
import { createTicket, listTickets } from "@/lib/services/tickets"

const FiltersSchema = z.object({
  projectId: z.string().optional(),
  status: z.string().optional(),
  assigneeId: z.string().optional(),
  parentId: z.string().optional(),
})

const NewTicketSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string(),
  priority: zPriority,
  type: zType,
  assigneeId: z.string().optional(),
  parentId: z.string().optional(),
  status: z.string().optional(),
  sourceUrl: z.string().optional(),
  screenshotUrl: zScreenshot.optional(),
  recordingUrl: zRecording.optional(),
  annotations: z.array(zAnnotation).optional(),
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
