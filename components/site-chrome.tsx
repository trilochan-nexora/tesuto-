import { ArrowRight, Flame } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Flame className="size-4.5" />
          </span>
          <span className="text-base font-semibold tracking-tight">Tesuto</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <Link
            href="/#how"
            className="transition-colors hover:text-foreground"
          >
            How it works
          </Link>
          <Link
            href="/widget"
            className="transition-colors hover:text-foreground"
          >
            Widget
          </Link>
        </nav>
        <Button size="sm" render={<Link href="/inbox" />}>
          Open Tesuto
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Flame className="size-4 text-primary" />
          <span>
            &copy; {new Date().getFullYear()} Tesuto — internal bug &amp;
            ticket tracking
          </span>
        </div>
        <span>Report the bug from exactly where you see it.</span>
      </div>
    </footer>
  )
}
