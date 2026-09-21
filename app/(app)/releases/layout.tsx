"use client"

import { useParams } from "next/navigation"
import { AppHeader } from "@/components/app-header"
import { ReleaseRail } from "@/components/release-rail"
import { ReleasesProvider } from "@/components/releases-context"

export default function ReleasesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams<{ id?: string }>()

  return (
    <ReleasesProvider>
      <AppHeader
        title="Releases"
        description="Prod API releases, posted in from Hearth's CI."
      />
      <div className="flex h-[calc(100svh-3.5rem)] overflow-hidden">
        <ReleaseRail activeId={params?.id} />
        {children}
      </div>
    </ReleasesProvider>
  )
}
