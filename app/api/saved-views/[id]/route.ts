import { z } from "zod"
import { handler } from "@/lib/api"
import { deleteSavedView, updateSavedView } from "@/lib/services/saved-views"

export const PATCH = handler({
  schema: z.object({ shared: z.boolean() }),
  run: (input, { user, params }) => updateSavedView(params.id, user, input),
})

export const DELETE = handler({
  run: (_input, { user, params }) => deleteSavedView(params.id, user),
})
