import { z } from "zod"
import { handler } from "@/lib/api"
import { createDoc, listDocs } from "@/lib/services/docs"

const NewDocSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  icon: z.string().max(50).optional(),
  projectId: z.string().min(1).max(128).optional(),
})

export const GET = handler({ run: () => listDocs() })

export const POST = handler({
  schema: NewDocSchema,
  run: (input, { user }) => createDoc(input, user.id),
})
