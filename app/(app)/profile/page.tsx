import { redirect } from "next/navigation"

// Profile and Settings are one page now — keep this route alive for anyone
// with the old link bookmarked.
export default function ProfilePage() {
  redirect("/settings")
}
