import { z } from "zod"
import { handler } from "@/lib/api"
import { updateProfile } from "@/lib/services/users"

const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().max(100).nullable().optional(),
  bio: z.string().max(2_000).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  githubLogin: z.string().trim().max(100).nullable().optional(),
})

export const PATCH = handler({
  schema: ProfileSchema,
  run: (input, { user }) => updateProfile(user.id, input),
})
