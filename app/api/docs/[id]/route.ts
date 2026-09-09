import { z } from "zod"
import { handler } from "@/lib/api"
import { deleteDoc, updateDoc } from "@/lib/services/docs"

const PatchSchema = z.object({
  title: z.string().optional(),
  icon: z.string().optional(),
  content: z.string().optional(),
  projectId: z.string().nullable().optional(),
})

export const PATCH = handler({
  schema: PatchSchema,
  run: (input, { params }) => updateDoc(params.id, input),
})

export const DELETE = handler({
  run: (_input, { params }) => deleteDoc(params.id),
})
