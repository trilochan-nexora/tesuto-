import { z } from "zod"
import { handler } from "@/lib/api"
import { setSetting } from "@/lib/services/settings"
import { INTEGRATION_KEYS } from "@/lib/services/settings"

const schema = z.object({
  key: z.enum(INTEGRATION_KEYS),
  enabled: z.boolean(),
})

/** Admins flip integration toggles; members just read them via bootstrap. */
export const PATCH = handler({
  schema,
  admin: true,
  run: (input) => setSetting(input.key, input.enabled),
})
