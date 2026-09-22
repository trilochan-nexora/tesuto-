import { z } from "zod"
import { handler } from "@/lib/api"
import { zRole } from "@/lib/schemas"
import { createUser, listUsers } from "@/lib/services/users"

const NewUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  role: zRole,
  title: z.string().trim().max(100).optional(),
})

export const GET = handler({ run: () => listUsers() })

export const POST = handler({
  schema: NewUserSchema,
  admin: true,
  run: (input) => createUser(input),
})
