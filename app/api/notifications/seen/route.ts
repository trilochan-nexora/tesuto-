import { handler } from "@/lib/api"
import { markNotificationsSeen } from "@/lib/services/notifications"

export const POST = handler({
  run: (_input, { user }) => markNotificationsSeen(user.id),
})
