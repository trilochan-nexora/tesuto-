import { z } from "zod"
import { handler } from "@/lib/api"
import { addComment, listComments } from "@/lib/services/comments"

const NewCommentSchema = z.object({ body: z.string().min(1) })

export const GET = handler({
  run: (_input, { params }) => listComments(params.id),
})

export const POST = handler({
  schema: NewCommentSchema,
  run: (input, { params, user }) => addComment(params.id, input.body, user.id),
})
