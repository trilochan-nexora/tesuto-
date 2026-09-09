import {
  ArrowRight,
  MessageSquare,
  MousePointerClick,
  ScanLine,
  SquareKanban,
} from "lucide-react"
import Link from "next/link"
import { GithubIcon } from "@/components/icons"
import { SiteFooter, SiteHeader } from "@/components/site-chrome"
import { Button } from "@/components/ui/button"

const steps = [
  {
    n: "01",
    icon: MousePointerClick,
    title: "Spot it in the running app",
    body: "A teammate hits Cmd+Shift+B on any page. The cursor becomes a picker — they click the exact element that's broken.",
  },
  {
    n: "02",
    icon: ScanLine,
    title: "Capture context automatically",
    body: "Tesuto grabs the screenshot, the DOM selector, the URL, console errors, and any failed requests — no copy-paste.",
  },
  {
    n: "03",
    icon: SquareKanban,
    title: "Triage on a board that keeps up",
    body: "The report lands in the backlog. Drag it across Backlog → In Progress → Done, assign an owner, set urgency.",
  },
  {
    n: "04",
    icon: GithubIcon,
    title: "Push to GitHub when it's real work",
    body: "One click opens a GitHub issue under your own account. The board stays the source of truth; sync is manual and deliberate.",
  },
]

const details = [
  {
    title: "One script tag, any app",
    body: "Drop the widget into Kairo, Levi, the marketing site — no npm dependency, no redeploy to pick up updates.",
  },
  {
    title: "The conversation stays on the ticket",
    body: "Threaded comments live next to the work instead of scattering across chat. They refetch when you refocus the tab.",
  },
  {
    title: "No tenant scaffolding",
    body: "This is an internal tool. No billing, no org switcher, no onboarding maze — just a fast tracker your team opens by habit.",
  },
]

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <section className="relative overflow-hidden border-b border-border/60">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] opacity-70"
          style={{
            background:
              "radial-gradient(56% 44% at 50% -8%, color-mix(in oklch, var(--primary) 24%, transparent), transparent 72%)",
          }}
        />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-7 px-6 py-28 text-center md:py-36">
          <h1 className="animate-rise text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.03em] md:text-6xl">
            Report the bug from exactly where you see it.
          </h1>
          <p
            className="animate-rise max-w-[46ch] text-pretty text-lg text-muted-foreground"
            style={{ animationDelay: "80ms" }}
          >
            Tesuto pairs a point-and-click reporting widget with a fast kanban
            board, per-ticket comments, and one-click GitHub sync — the tracker
            your team actually wants to open.
          </p>
          <div
            className="animate-rise flex flex-col items-center gap-3 sm:flex-row"
            style={{ animationDelay: "160ms" }}
          >
            <Button size="lg" render={<Link href="/inbox" />}>
              Open the dashboard
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link href="/widget" />}
            >
              Try the widget
            </Button>
          </div>
        </div>
      </section>

      <section
        id="how"
        className="mx-auto w-full max-w-5xl px-6 py-24 md:py-32"
      >
        <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.02em]">
          From spotted to shipped, without leaving a trail of screenshots in
          chat.
        </h2>
        <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.n} className="flex gap-5">
              <span className="mt-1 font-mono text-sm text-muted-foreground tabular-nums">
                {step.n}
              </span>
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-2.5 text-primary">
                  <step.icon className="size-5" />
                </span>
                <h3 className="text-lg font-medium tracking-tight">
                  {step.title}
                </h3>
                <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border/60 bg-muted/25">
        <div className="mx-auto w-full max-w-5xl divide-y divide-border/60 px-6">
          {details.map((detail) => (
            <div
              key={detail.title}
              className="grid gap-2 py-8 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10"
            >
              <h3 className="font-medium tracking-tight">{detail.title}</h3>
              <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
                {detail.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-6 py-24 md:py-32">
        <h2 className="max-w-lg text-3xl font-semibold tracking-[-0.02em]">
          Open the board and turn a screenshot into a shipped fix.
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" render={<Link href="/inbox" />}>
            Open Tesuto
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button size="lg" variant="ghost" render={<Link href="/sprints" />}>
            <MessageSquare data-icon="inline-start" />
            Read the docs
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
