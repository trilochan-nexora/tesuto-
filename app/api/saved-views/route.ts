import { z } from "zod"
import { handler } from "@/lib/api"
import { createSavedView, listSavedViews } from "@/lib/services/saved-views"
import { INBOX_FILTERS } from "@/lib/types"

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  filter: z.enum(INBOX_FILTERS),
  query: z.string().trim().max(100).default(""),
  shared: z.boolean().default(false),
})

export const GET = handler({
  run: (_input, { user }) => listSavedViews(user.id),
})

export const POST = handler({
  schema: CreateSchema,
  run: (input, { user }) => createSavedView(user.id, input),
})
