import { z } from "zod"
import { handler } from "@/lib/api"
import { createDoc, listDocs } from "@/lib/services/docs"

const NewDocSchema = z.object({
  title: z.string().optional(),
  icon: z.string().optional(),
  projectId: z.string().optional(),
})

export const GET = handler({ run: () => listDocs() })

export const POST = handler({
  schema: NewDocSchema,
  run: (input, { user }) => createDoc(input, user.id),
})
