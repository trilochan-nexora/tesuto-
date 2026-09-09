import { z } from "zod"
import { handler } from "@/lib/api"
import { zRole } from "@/lib/schemas"
import { createUser, listUsers } from "@/lib/services/users"

const NewUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: zRole,
  title: z.string().optional(),
})

export const GET = handler({ run: () => listUsers() })

export const POST = handler({
  schema: NewUserSchema,
  admin: true,
  run: (input) => createUser(input),
})
