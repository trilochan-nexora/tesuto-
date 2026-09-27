import { ArrowRightIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"
import { TesutoMark } from "@/components/icons"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <span className="flex size-12 items-center justify-center rounded-xl bg-brand text-brand-foreground">
        <TesutoMark className="size-6" />
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
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </div>
  )
}
