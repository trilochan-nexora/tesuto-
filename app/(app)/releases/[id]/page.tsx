"use client"

import { notFound } from "next/navigation"
import { use } from "react"
import { ReleaseDetail } from "@/components/release-detail"
import { useReleases } from "@/components/releases-context"

export default function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const releases = useReleases()

  if (releases === null) {
    return <div className="flex-1" />
  }

  const release = releases.find((r) => r.id === id)
  if (!release) notFound()

  return <ReleaseDetail release={release} />
}
