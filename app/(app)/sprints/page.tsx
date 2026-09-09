"use client"

import { NotebookPen } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { DocRail } from "@/components/doc-rail"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export default function SprintsPage() {
  return (
    <>
      <AppHeader
        title="Sprints"
        description="Plans and notes, linked together"
      />
      <div className="flex h-[calc(100svh-3.5rem)] overflow-hidden">
        <DocRail />
        <div className="flex flex-1 items-center justify-center p-8">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <NotebookPen />
              </EmptyMedia>
              <EmptyTitle>Pick a document</EmptyTitle>
              <EmptyDescription>
                Or start a new one. Link documents with{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  [[title]]
                </code>{" "}
                and Tesuto tracks the backlinks.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    </>
  )
}
