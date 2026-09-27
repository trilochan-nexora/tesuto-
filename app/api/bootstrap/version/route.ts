import { handler } from "@/lib/api"
import { loadBootstrapVersion } from "@/lib/services/bootstrap"

export const GET = handler({
  run: async () => ({ version: await loadBootstrapVersion() }),
})
