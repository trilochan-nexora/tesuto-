import { z } from "zod"
import { handler } from "@/lib/api"
import { signIn } from "@/lib/services/users"

const SignInSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export const POST = handler({
  schema: SignInSchema,
  auth: false,
  run: (input) => signIn(input),
})
