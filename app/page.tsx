import { ArrowRightIcon, ChatIcon, CursorClickIcon, ScanIcon, KanbanIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"
import type { SVGProps } from "react"
import { GithubIcon } from "@/components/icons"
import { SiteFooter, SiteHeader } from "@/components/site-chrome"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Accent = "interactive" | "text" | "structure" | "git"

// Icon colors are 700-weight in light mode (not the more obvious 600) so
// they clear 4.5:1 against the near-white tint behind them — 600 measures
// closer to 3–3.7:1 for amber/cyan, borderline for a UI-component color.
const ACCENT_CLASSES: Record<Accent, string> = {
  interactive:
    "bg-violet-500/12 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  text: "bg-cyan-500/12 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
  structure:
    "bg-amber-500/12 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  git: "bg-foreground text-background",
}

const ACCENT_LINE: Record<Accent, string> = {
  interactive: "bg-violet-500/40 dark:bg-violet-400/40",
  text: "bg-cyan-500/40 dark:bg-cyan-400/40",
  structure: "bg-amber-500/40 dark:bg-amber-400/40",
  git: "bg-foreground/30",
}

const steps: {
  icon: React.ComponentType<SVGProps<SVGSVGElement>>
  title: string
  body: string
  accent: Accent
}[] = [
  {
    icon: CursorClickIcon,
    title: "Spot it in the running app",
    body: "A teammate hits Cmd+Shift+B on any page. The cursor becomes a picker — they click the exact element that's broken.",
    accent: "interactive",
  },
  {
    icon: ScanIcon,
    title: "Capture context automatically",
    body: "Tesuto grabs the screenshot, the DOM selector, the URL, console errors, and any failed requests — no copy-paste.",
    accent: "text",
  },
  {
    icon: KanbanIcon,
    title: "Triage on a board that keeps up",
    body: "The report lands in the backlog. Drag it across Backlog → In Progress → Done, assign an owner, set urgency.",
    accent: "structure",
  },
  {
    icon: GithubIcon,
    title: "Push to GitHub when it's real work",
    body: "One click opens a GitHub issue under your own account. The board stays the source of truth; sync is manual and deliberate.",
    accent: "git",
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
        <ScanField className="h-[40rem]" />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-7 px-6 py-28 text-center md:py-36">
          <ViewfinderCorners />
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
              <ArrowRightIcon data-icon="inline-end" />
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
        className="mx-auto w-full max-w-4xl px-6 py-24 md:py-32"
      >
        <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.02em]">
          From spotted to shipped, without leaving a trail of screenshots in
          chat.
        </h2>

        <ol className="relative mt-16 flex flex-col gap-12">
          {steps.map((step, i) => (
            <li key={step.title} className="relative flex gap-6">
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-14 left-7 w-px translate-x-[-0.5px]",
                    ACCENT_LINE[step.accent],
                  )}
                  style={{ height: "calc(100% - 0.5rem)" }}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl",
                  ACCENT_CLASSES[step.accent],
                )}
              >
                <step.icon className="size-6" />
              </span>
              <div className="flex flex-col gap-2 pt-2.5">
                <h3 className="text-lg font-medium tracking-tight">
                  {step.title}
                </h3>
                <p className="max-w-md text-[0.95rem] leading-relaxed text-muted-foreground">
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

      <section className="relative overflow-hidden">
        <ScanField className="h-full" faint />
        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-6 py-24 md:py-32">
          <h2 className="max-w-lg text-3xl font-semibold tracking-[-0.02em]">
            Open the board and turn a screenshot into a shipped fix.
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" render={<Link href="/inbox" />}>
              Open Tesuto
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button size="lg" variant="ghost" render={<Link href="/widget" />}>
              <ChatIcon data-icon="inline-start" />
              Try the widget
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}

/** A faint measurement grid with two off-center glows — the same picker
 * (dots, brackets, precise dimensions) that Tesuto points at your UI,
 * turned into the backdrop instead of a stock hero gradient. */
function ScanField({
  className,
  faint,
}: {
  className?: string
  faint?: boolean
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 top-0", className)}
      style={{
        opacity: faint ? 0.5 : 1,
        maskImage:
          "radial-gradient(65% 70% at 50% 20%, black 40%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(65% 70% at 50% 20%, black 40%, transparent 100%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.25]"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in oklch, var(--foreground) 45%, transparent) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div
        className="absolute -top-16 left-[8%] size-[26rem] rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--brand) 30%, transparent), transparent 70%)",
        }}
      />
      <div
        className="absolute top-4 right-[6%] size-[22rem] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, oklch(0.75 0.16 195) 32%, transparent), transparent 70%)",
        }}
      />
    </div>
  )
}

/** The picker's own reticle, scaled up to frame the headline instead of an
 * element — the hero says what the product does before the copy does. */
function ViewfinderCorners() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-6 md:inset-10">
      {(
        [
          ["top-0 left-0", "border-t-2 border-l-2 rounded-tl-xl"],
          ["top-0 right-0", "border-t-2 border-r-2 rounded-tr-xl"],
          ["bottom-0 left-0", "border-b-2 border-l-2 rounded-bl-xl"],
          ["bottom-0 right-0", "border-b-2 border-r-2 rounded-br-xl"],
        ] as const
      ).map(([pos, sides]) => (
        <span
          key={pos}
          className={cn(
            "absolute size-6 border-foreground/15 md:size-8",
            pos,
            sides,
          )}
        />
      ))}
    </div>
  )
}
