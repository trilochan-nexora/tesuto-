import { z } from "zod"
import { handler } from "@/lib/api"
import { deleteDoc, updateDoc } from "@/lib/services/docs"

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  icon: z.string().max(50).optional(),
  content: z.string().max(500_000).optional(),
  projectId: z.string().min(1).max(128).nullable().optional(),
})

export const PATCH = handler({
  schema: PatchSchema,
  run: (input, { params }) => updateDoc(params.id, input),
})

export const DELETE = handler({
  run: (_input, { params }) => deleteDoc(params.id),
})
