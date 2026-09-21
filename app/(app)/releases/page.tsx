"use client"

import { Rocket } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useReleases } from "@/components/releases-context"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export default function ReleasesPage() {
  const releases = useReleases()
  const router = useRouter()

  useEffect(() => {
    if (releases && releases.length > 0) {
      router.replace(`/releases/${releases[0].id}`)
    }
  }, [releases, router])

  if (releases && releases.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Rocket />
            </EmptyMedia>
            <EmptyTitle>No releases yet</EmptyTitle>
            <EmptyDescription>
              Nothing's landed here yet — this fills in the next time Hearth
              ships a prod API release.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return null
}
