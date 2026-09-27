import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"
import { Button } from "@/components/ui/button"

// In-shell 404 for notFound() from a bad ticket/project/sprint/release id —
// keeps the sidebar, unlike the root not-found page.
export default function AppNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <MagnifyingGlassIcon className="size-8 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Not found</h1>
          <p className="text-sm text-muted-foreground">
            It may have been deleted, or the link is wrong.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/inbox" />}>
          Back to inbox
        </Button>
      </div>
    </div>
  )
}
