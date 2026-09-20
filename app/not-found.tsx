import { ArrowRight, Flame } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Flame className="size-6" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          This page doesn't exist.
        </h1>
        <p className="text-muted-foreground">
          The link may be broken, or the page may have moved.
        </p>
      </div>
      <Button render={<Link href="/" />}>
        Back to Tesuto
        <ArrowRight data-icon="inline-end" />
      </Button>
    </div>
  )
}
