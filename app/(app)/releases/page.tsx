"use client"

import { Rocket } from "lucide-react"
import { ReleaseDetail } from "@/components/release-detail"
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

  if (releases === null) {
    return <div className="flex-1" />
  }

  if (releases.length === 0) {
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

  return <ReleaseDetail release={releases[0]} />
}
