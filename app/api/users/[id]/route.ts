import { z } from "zod"
import { handler } from "@/lib/api"
import { zRole } from "@/lib/schemas"
import { updateUser } from "@/lib/services/users"

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(254).optional(),
  role: zRole.optional(),
  title: z.string().trim().max(100).nullable().optional(),
  bio: z.string().max(2_000).nullable().optional(),
  active: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  githubLogin: z.string().trim().max(100).nullable().optional(),
})

export const PATCH = handler({
  schema: PatchSchema,
  admin: true,
  run: (input, { params }) => updateUser(params.id, input),
})
