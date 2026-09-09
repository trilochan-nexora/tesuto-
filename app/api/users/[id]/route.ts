import { z } from "zod"
import { handler } from "@/lib/api"
import { zRole } from "@/lib/schemas"
import { updateUser } from "@/lib/services/users"

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: zRole.optional(),
  title: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  active: z.boolean().optional(),
  color: z.string().optional(),
  githubLogin: z.string().nullable().optional(),
})

export const PATCH = handler({
  schema: PatchSchema,
  admin: true,
  run: (input, { params }) => updateUser(params.id, input),
})
