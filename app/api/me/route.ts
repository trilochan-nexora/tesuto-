import { z } from "zod"
import { handler } from "@/lib/api"
import { updateProfile } from "@/lib/services/users"

const ProfileSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  color: z.string().optional(),
  githubLogin: z.string().nullable().optional(),
})

export const PATCH = handler({
  schema: ProfileSchema,
  run: (input, { user }) => updateProfile(user.id, input),
})
