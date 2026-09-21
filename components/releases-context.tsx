"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { api } from "@/lib/api-client"
import type { Release } from "@/lib/types"

const ReleasesContext = createContext<Release[] | null>(null)

/** Fetched once for the whole /releases segment, shared by the rail and detail pane. */
export function ReleasesProvider({ children }: { children: React.ReactNode }) {
  const [releases, setReleases] = useState<Release[] | null>(null)

  useEffect(() => {
    api
      .get<Release[]>("/releases")
      .then(setReleases)
      .catch(() => setReleases([]))
  }, [])

  return (
    <ReleasesContext.Provider value={releases}>
      {children}
    </ReleasesContext.Provider>
  )
}

/** `null` while loading, `[]` once loaded with nothing (or the integration off). */
export function useReleases() {
  return useContext(ReleasesContext)
}
