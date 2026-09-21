"use client"

import { toPng } from "html-to-image"
import {
  Bug,
  Check,
  CircleCheck,
  Crosshair,
  KeyRound,
  Loader2,
  LogIn,
  MousePointer2,
  TriangleAlert,
  X,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { ScreenshotEditor } from "@/components/screenshot-editor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useStore } from "@/lib/store"
import {
  ANNOTATION_COLORS,
  type Annotation,
  type IssueType,
  PRIORITY_META,
  PRIORITY_ORDER,
  type TicketPriority,
  TYPE_META,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  detectClient,
  WIDGET_SCENES,
  type WidgetTelemetry,
} from "@/lib/widget-scenes"

type Picked = {
  selector: string
  tag: string
  text: string
  rect: { top: number; left: number; width: number; height: number }
  frac: { x: number; y: number; w: number; h: number }
}

type Filed = { key: string; id: string; title: string; project: string }

export default function WidgetPage() {
  const { addTicket, resolveProjectByToken, projects, users, currentUser } =
    useStore()

  const sandbox = projects.find((p) => p.key === "SAND")
  const [token, setToken] = useState(sandbox?.token ?? "")
  const [notSignedIn, setNotSignedIn] = useState(false)
  const resolved = resolveProjectByToken(token)
  const authed = notSignedIn ? undefined : resolved

  const [sceneId, setSceneId] = useState(WIDGET_SCENES[0].id)
  const scene = useMemo(
    () => WIDGET_SCENES.find((s) => s.id === sceneId) ?? WIDGET_SCENES[0],
    [sceneId],
  )

  const [picking, setPicking] = useState(false)
  const [hover, setHover] = useState<Picked | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [recording, setRecording] = useState<string | null>(null)
  const [recState, setRecState] = useState<
    "idle" | "starting" | "recording" | "error"
  >("idle")
  const [recErr, setRecErr] = useState("")
  const [recElapsed, setRecElapsed] = useState(0)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [telemetry, setTelemetry] = useState<WidgetTelemetry>({
    consoleErrors: [],
    failedRequests: [],
  })

  const [signingIn, setSigningIn] = useState(false)
  const [signInName, setSignInName] = useState("")
  const [signInEmail, setSignInEmail] = useState("")

  const [title, setTitle] = useState("")
  const [note, setNote] = useState("")
  const [type, setType] = useState<IssueType>("bug")
  const [priority, setPriority] = useState<TicketPriority>("medium")
  const [assigneeId, setAssigneeId] = useState("unassigned")
  const [filed, setFiled] = useState<Filed[]>([])
  const [realLoaded, setRealLoaded] = useState(false)

  function loadRealWidget() {
    if (document.getElementById("tesuto-widget-script") || !resolved)
      return // Hand the widget the signed-in user the way a host app does (via
      // window.__TESUTO__) — unless we're simulating a signed-out visitor.
    ;(window as unknown as { __TESUTO__?: unknown }).__TESUTO__ = {
      token: resolved.token,
      user: notSignedIn
        ? undefined
        : { name: currentUser.name, email: currentUser.email },
    }
    const s = document.createElement("script")
    s.id = "tesuto-widget-script"
    s.src = "/widget.js"
    document.body.appendChild(s)
    setRealLoaded(true)
  }

  const frameRef = useRef<HTMLDivElement>(null)
  const captureRef = useRef<HTMLDivElement>(null)
  const hoverElRef = useRef<HTMLElement | null>(null)
  const recRef = useRef<{
    recorder: MediaRecorder | null
    stream: MediaStream | null
    chunks: Blob[]
    timer: number | null
    startedAt: number
    active: boolean
    resolve: ((v: string | null) => void) | null
  }>({
    recorder: null,
    stream: null,
    chunks: [],
    timer: null,
    startedAt: 0,
    active: false,
    resolve: null,
  })

  // Run the scene's bug once and capture the real error + failed request.
  useEffect(() => {
    let cancelled = false
    setPicking(false)
    setPicked(null)
    setShot(null)
    setAnnotations([])
    scene.bug().then((t) => {
      if (!cancelled) setTelemetry(t)
    })
    return () => {
      cancelled = true
    }
  }, [scene])

  const describe = useCallback((el: HTMLElement): Picked => {
    const frame = frameRef.current
    const fr = frame?.getBoundingClientRect() ?? new DOMRect()
    const r = el.getBoundingClientRect()
    const testid = el.getAttribute("data-testid")
    const selector = testid
      ? `[data-testid="${testid}"]`
      : el.id
        ? `#${el.id}`
        : el.getAttribute("aria-label")
          ? `[aria-label="${el.getAttribute("aria-label")}"]`
          : structuralSelector(el)
    const top = r.top - fr.top
    const left = r.left - fr.left
    return {
      selector,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
      rect: { top, left, width: r.width, height: r.height },
      frac: {
        x: fr.width ? left / fr.width : 0,
        y: fr.height ? top / fr.height : 0,
        w: fr.width ? r.width / fr.width : 0,
        h: fr.height ? r.height / fr.height : 0,
      },
    }
  }, [])

  useEffect(() => {
    if (!picking) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPicking(false)
        setHover(null)
        hoverElRef.current = null
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        const parent = hoverElRef.current?.parentElement
        if (parent && frameRef.current?.contains(parent)) {
          hoverElRef.current = parent
          setHover(describe(parent))
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [picking, describe])

  useEffect(() => {
    function onShortcut(e: KeyboardEvent) {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "b"
      ) {
        e.preventDefault()
        if (!authed) return
        setPicked(null)
        setPicking((p) => !p)
      }
    }
    window.addEventListener("keydown", onShortcut)
    return () => window.removeEventListener("keydown", onShortcut)
  }, [authed])

  function targetFrom(e: React.MouseEvent) {
    return (e.target as HTMLElement).closest<HTMLElement>("[data-pick]")
  }

  async function capture(sel: string) {
    setCapturing(true)
    try {
      if (captureRef.current) {
        const url = await toPng(captureRef.current, {
          pixelRatio: 2,
          cacheBust: true,
        })
        setShot(url)
        return
      }
    } catch {
      // html-to-image can choke on some CSS — fall back to a labelled stub
    } finally {
      setCapturing(false)
    }
    setShot(fallbackShot(sel))
  }

  /* Screen recording (mirrors public/widget.js): getDisplayMedia +
     MediaRecorder, 60 s / 10 MB caps, attached as a data URL on submit. */
  const REC_MAX_S = 60
  const REC_MAX_BYTES = 10 * 1024 * 1024

  function recSupported() {
    const md = navigator.mediaDevices
    return (
      !!md &&
      typeof md.getDisplayMedia === "function" &&
      typeof MediaRecorder === "function"
    )
  }

  function cleanupRec() {
    const r = recRef.current
    r.active = false
    if (r.timer) {
      window.clearInterval(r.timer)
      r.timer = null
    }
    if (r.stream) {
      try {
        r.stream.getTracks().forEach((t) => {
          t.stop()
        })
      } catch {}
      r.stream = null
    }
    r.recorder = null
    r.chunks = []
  }

  function finishRecording() {
    const r = recRef.current
    r.active = false
    const chunks = r.chunks.slice()
    const mime = r.recorder?.mimeType || "video/webm"
    const resolve = r.resolve
    r.resolve = null
    cleanupRec()
    const done = (v: string | null) => resolve?.(v)
    const blob = new Blob(chunks, { type: mime })
    if (!blob.size) {
      setRecState("idle")
      done(null)
      return
    }
    if (blob.size > REC_MAX_BYTES) {
      setRecording(null)
      setRecState("error")
      setRecErr("too-large")
      done(null)
      return
    }
    const fr = new FileReader()
    fr.onload = () => {
      const url = String(fr.result || "")
      setRecording(url || null)
      setRecState(url ? "idle" : "error")
      if (!url) setRecErr("failed")
      done(url || null)
    }
    fr.onerror = () => {
      setRecState("error")
      setRecErr("failed")
      done(null)
    }
    fr.readAsDataURL(blob)
  }

  async function startRecording() {
    if (!recSupported()) {
      setRecState("error")
      setRecErr("unsupported")
      return
    }
    setRecording(null)
    setRecState("starting")
    setRecErr("")
    setRecElapsed(0)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })
    } catch (err) {
      setRecState("idle")
      if (
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "AbortError")
      ) {
        return
      }
      setRecState("error")
      setRecErr("failed")
      return
    }
    const mime = ["video/webm;codecs=vp9", "video/webm", "video/mp4"].find(
      (m) => {
        try {
          return MediaRecorder.isTypeSupported(m)
        } catch {
          return false
        }
      },
    )
    const r = recRef.current
    try {
      r.recorder = mime
        ? new MediaRecorder(stream, {
            mimeType: mime,
            videoBitsPerSecond: 1500000,
          })
        : new MediaRecorder(stream)
    } catch {
      try {
        stream.getTracks().forEach((t) => {
          t.stop()
        })
      } catch {}
      setRecState("error")
      setRecErr("failed")
      return
    }
    r.stream = stream
    r.chunks = []
    r.startedAt = Date.now()
    r.recorder.ondataavailable = (e) => {
      if (e.data?.size) r.chunks.push(e.data)
    }
    r.recorder.onstop = () => finishRecording()
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      void stopRecording()
    })
    try {
      r.recorder.start(500)
    } catch {
      cleanupRec()
      setRecState("error")
      setRecErr("failed")
      return
    }
    r.active = true
    setRecState("recording")
    r.timer = window.setInterval(() => {
      const elapsed = Date.now() - r.startedAt
      setRecElapsed(elapsed)
      if (elapsed >= REC_MAX_S * 1000) void stopRecording()
    }, 500)
  }

  function stopRecording() {
    const r = recRef.current
    return new Promise<string | null>((resolve) => {
      if (!r.recorder || !r.active) {
        cleanupRec()
        resolve(recording)
        return
      }
      r.resolve = resolve
      try {
        r.recorder.stop()
      } catch {
        cleanupRec()
        resolve(recording)
      }
    })
  }

  // Stop any capture when leaving the page.
  useEffect(
    () => () => {
      const r = recRef.current
      if (r.timer) window.clearInterval(r.timer)
      if (r.stream) {
        try {
          r.stream.getTracks().forEach((t) => {
            t.stop()
          })
        } catch {}
      }
    },
    [],
  )

  function onPick(p: Picked) {
    setPicked(p)
    setPicking(false)
    setHover(null)
    hoverElRef.current = null
    // seed a box outlining exactly what was clicked
    setAnnotations([
      {
        id: `an_seed_${Date.now()}`,
        kind: "box",
        x: p.frac.x,
        y: p.frac.y,
        w: Math.max(p.frac.w, 0.04),
        h: Math.max(p.frac.h, 0.04),
        color: ANNOTATION_COLORS[0],
        label: "Here",
      },
    ])
    setShot(null)
    void capture(p.selector)
  }

  function resetReport() {
    setPicked(null)
    setShot(null)
    setRecording(null)
    setRecState("idle")
    setRecErr("")
    setRecElapsed(0)
    void stopRecording().then(() => {
      setRecording(null)
      setRecState("idle")
    })
    setAnnotations([])
    setTitle("")
    setNote("")
    setType("bug")
    setPriority("medium")
    setAssigneeId("unassigned")
  }

  async function submit() {
    if (!picked || !authed) return
    const client = detectClient()
    const clip = await stopRecording()
    let ticket: Awaited<ReturnType<typeof addTicket>>
    try {
      ticket = await addTicket({
        title: title.trim() || `Issue on ${picked.selector}`,
        description: note.trim() || undefined,
        projectId: authed.id,
        type,
        priority,
        assigneeId: assigneeId === "unassigned" ? undefined : assigneeId,
        sourceUrl: `https://demo.tesuto.app${scene.path}`,
        screenshotUrl: shot ?? undefined,
        recordingUrl: clip ?? undefined,
        annotations: annotations.length ? annotations : undefined,
        domSnapshot: {
          selector: picked.selector,
          tag: picked.tag,
          text: picked.text || undefined,
          rect: {
            width: Math.round(picked.rect.width),
            height: Math.round(picked.rect.height),
          },
        },
        context: {
          browser: client.browser,
          os: client.os,
          viewport: `${window.innerWidth}×${window.innerHeight}`,
          consoleErrors: telemetry.consoleErrors.length
            ? telemetry.consoleErrors
            : undefined,
          failedRequests: telemetry.failedRequests.length
            ? telemetry.failedRequests
            : undefined,
        },
      })
    } catch (err) {
      toast.error("Couldn't file the ticket")
      console.error(err)
      return
    }
    setFiled((f) => [
      {
        key: ticket.key,
        id: ticket.id,
        title: ticket.title,
        project: authed.name,
      },
      ...f,
    ])
    toast.success(`Filed ${ticket.key} → ${authed.name}`)
    resetReport()
  }

  const activeUsers = users.filter((u) => u.active)
  const capturedCount =
    telemetry.consoleErrors.length + telemetry.failedRequests.length

  return (
    <>
      <AppHeader
        title="Widget"
        description="Try the point-and-report widget on a stand-in app"
      />

      <section className="flex w-full flex-col gap-6 p-4 md:p-8">
        <p className="max-w-2xl text-[0.95rem] text-muted-foreground">
          Below is a stand-in customer app. Authenticate with a project token,
          press <Kbd>⌘⇧B</Kbd> or the Tesuto button, click the broken element (
          <Kbd>↑</Kbd> selects its parent), mark it up, and file a real ticket.
        </p>

        {/* Auth */}
        <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-4">
          <label
            htmlFor="widget-token"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          >
            <KeyRound className="size-3.5" />
            Project token
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="widget-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="tsto_pk_…"
              className="font-mono text-xs sm:max-w-md"
            />
            {notSignedIn ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <LogIn className="size-4" />
                Simulating a signed-out visitor
              </span>
            ) : resolved ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CircleCheck className="size-4" />
                Authenticated as{" "}
                <strong className="font-medium">{resolved.name}</strong>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {token
                  ? "Token not recognised"
                  : "Paste a token to authenticate"}
              </span>
            )}
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={notSignedIn}
              onChange={(e) => setNotSignedIn(e.target.checked)}
              className="size-3.5 rounded border-input accent-primary"
            />
            Simulate: visitor not signed in to Tesuto
          </label>
          <p className="text-xs text-muted-foreground">
            Grab a token from any project&apos;s{" "}
            <Link href="/projects" className="text-primary hover:underline">
              setup page
            </Link>
            .
          </p>
        </div>

        {/* Scene switcher */}
        <Tabs value={sceneId} onValueChange={setSceneId}>
          <TabsList>
            {WIDGET_SCENES.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Mock app frame */}
        <div
          ref={frameRef}
          className={cn(
            "relative overflow-hidden rounded-2xl border border-border bg-card ring-1 ring-foreground/10",
            picking && "cursor-crosshair",
          )}
          onMouseMove={(e) => {
            if (!picking) return
            const el = targetFrom(e)
            hoverElRef.current = el
            setHover(el ? describe(el) : null)
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            if (!picking) return
            const el = hoverElRef.current ?? targetFrom(e)
            if (!el) return
            e.preventDefault()
            onPick(describe(el))
          }}
        >
          <div ref={captureRef} className="bg-card">
            <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-red-400/70" />
              <span className="size-2.5 rounded-full bg-amber-400/70" />
              <span className="size-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-3 font-mono text-xs text-muted-foreground">
                demo.tesuto.app{scene.path}
              </span>
            </div>
            <scene.Mock />
          </div>

          {picking && hover ? (
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 rounded-md border-2 border-primary bg-primary/10"
              style={{
                top: hover.rect.top,
                left: hover.rect.left,
                width: hover.rect.width,
                height: hover.rect.height,
              }}
            >
              <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 font-mono text-[11px] text-primary-foreground">
                {hover.selector}
              </span>
            </div>
          ) : null}

          {picked && !shot ? (
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 rounded-md border-2 border-primary"
              style={{
                top: picked.rect.top,
                left: picked.rect.left,
                width: picked.rect.width,
                height: picked.rect.height,
              }}
            />
          ) : null}

          {!picked ? (
            authed ? (
              <button
                type="button"
                onClick={() => {
                  setPicked(null)
                  setPicking((p) => !p)
                }}
                className={cn(
                  "absolute bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg transition-colors",
                  picking
                    ? "bg-foreground text-background"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {picking ? (
                  <>
                    <X className="size-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Crosshair className="size-4" />
                    Report a bug
                  </>
                )}
              </button>
            ) : signingIn ? (
              <div className="absolute bottom-5 right-5 z-20 w-72 rounded-xl border border-border bg-card p-4 shadow-lg ring-1 ring-foreground/10">
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!signInName.trim() || !signInEmail.trim()) return
                    setNotSignedIn(false)
                    setSigningIn(false)
                  }}
                >
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <LogIn className="size-4" />
                    Sign in to Tesuto
                  </div>
                  <p className="text-xs text-muted-foreground">
                    File issues and comment. Dev mode: any name + email
                    works.
                  </p>
                  <Input
                    autoFocus
                    placeholder="Your name"
                    value={signInName}
                    onChange={(e) => setSignInName(e.target.value)}
                  />
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSigningIn(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" className="flex-1">
                      Sign in
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSigningIn(true)}
                className="absolute bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-foreground/90 px-4 py-2.5 text-sm font-medium text-background shadow-lg transition-colors hover:bg-foreground"
              >
                <LogIn className="size-4" />
                Sign in to Tesuto to report
              </button>
            )
          ) : null}
        </div>

        {/* Captured context preview */}
        {capturedCount > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 text-xs ring-1 ring-foreground/10">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <MousePointer2 className="size-3.5" />
              The widget has already captured {capturedCount} signal
              {capturedCount === 1 ? "" : "s"} from this page
            </span>
            {telemetry.consoleErrors.map((line) => (
              <code
                key={line}
                className="flex items-start gap-1.5 font-mono text-destructive"
              >
                <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                {line}
              </code>
            ))}
            {telemetry.failedRequests.map((line) => (
              <code key={line} className="font-mono text-foreground/70">
                {line}
              </code>
            ))}
          </div>
        ) : null}

        {/* Report form */}
        {picked ? (
          <div className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/10">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Bug className="size-4 text-primary" />
              <span className="text-sm font-medium">New report</span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {picked.selector}
              </span>
              <button
                type="button"
                onClick={resetReport}
                className="ml-auto text-muted-foreground hover:text-foreground"
                aria-label="Discard report"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div>
                {capturing ? (
                  <div className="flex h-40 items-center justify-center rounded-xl bg-muted/50 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Capturing screenshot…
                  </div>
                ) : shot ? (
                  <ScreenshotEditor
                    src={shot}
                    annotations={annotations}
                    onChange={setAnnotations}
                    editable
                  />
                ) : null}

                <div className="mt-3">
                  {recState === "recording" ? (
                    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
                      <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
                      Recording{" "}
                      {`${Math.floor(recElapsed / 60000)}:${String(Math.floor(recElapsed / 1000) % 60).padStart(2, "0")}`}{" "}
                      · up to 1:00
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto"
                        onClick={() => void stopRecording()}
                      >
                        Stop
                      </Button>
                    </div>
                  ) : recording ? (
                    <div className="flex flex-col gap-1.5">
                      {/* biome-ignore lint/a11y/useMediaCaption: demo clip recorded in-session, no captions exist */}
                      <video
                        src={recording}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full rounded-xl border border-border bg-black"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setRecording(null)
                          setRecState("idle")
                        }}
                        className="w-fit text-xs text-muted-foreground hover:text-foreground"
                      >
                        Remove recording
                      </button>
                    </div>
                  ) : recSupported() ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void startRecording()}
                      disabled={recState === "starting"}
                    >
                      <span className="size-2 rounded-full bg-red-500" />
                      {recState === "starting"
                        ? "Starting — allow the share prompt…"
                        : "Record screen (up to 1 min)"}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Screen recording isn&apos;t available in this browser.
                    </p>
                  )}
                  {recState === "error" ? (
                    <p className="mt-1.5 text-xs text-destructive">
                      {recErr === "too-large"
                        ? "That clip is over 10 MB — discarded. Try a shorter one."
                        : "Couldn't record."}{" "}
                      <button
                        type="button"
                        onClick={() => void startRecording()}
                        className="underline"
                      >
                        Retry
                      </button>
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <Input
                  autoFocus
                  placeholder="What's wrong?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Textarea
                  rows={3}
                  placeholder="Steps to reproduce (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={type}
                    onValueChange={(v) => v && setType(v as IssueType)}
                  >
                    <SelectTrigger className="w-full" size="sm">
                      {TYPE_META[type].label}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(Object.keys(TYPE_META) as IssueType[]).map((t) => (
                          <SelectItem key={t} value={t}>
                            {TYPE_META[t].label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Select
                    value={priority}
                    onValueChange={(v) => v && setPriority(v as TicketPriority)}
                  >
                    <SelectTrigger className="w-full" size="sm">
                      {PRIORITY_META[priority].label}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {PRIORITY_ORDER.map((p) => (
                          <SelectItem key={p} value={p}>
                            {PRIORITY_META[p].label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <Select
                  value={assigneeId}
                  onValueChange={(v) => v && setAssigneeId(v)}
                >
                  <SelectTrigger className="w-full" size="sm">
                    {assigneeId === "unassigned"
                      ? "Unassigned"
                      : users.find((u) => u.id === assigneeId)?.name}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {activeUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="self-end"
                  onClick={submit}
                  disabled={capturing}
                >
                  <Check data-icon="inline-start" />
                  File ticket
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Session results */}
        {filed.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/10">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Filed this session · {filed.length}
            </span>
            <ul className="flex flex-col divide-y divide-border">
              {filed.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
                  <CircleCheck className="size-4 shrink-0 text-emerald-500" />
                  <Link
                    href={`/tickets/${f.id}`}
                    className="min-w-0 flex-1 truncate hover:underline"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {f.key}
                    </span>{" "}
                    {f.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {f.project}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-1">
              <Button
                size="xs"
                variant="outline"
                render={<Link href="/inbox" />}
              >
                Open inbox
              </Button>
              <Button
                size="xs"
                variant="outline"
                render={<Link href="/board" />}
              >
                Open board
              </Button>
            </div>
          </div>
        ) : null}

        {/* The real thing */}
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-4">
          <span className="text-sm font-medium">
            Run the real widget.js here
          </span>
          <p className="text-xs text-muted-foreground">
            Everything above is a React simulation. This injects the actual{" "}
            <code className="rounded bg-muted px-1 py-0.5">/widget.js</code>{" "}
            onto this page — a dependency-free script that works on any site.
            Its floating button appears bottom-right (drag it anywhere — the
            spot is remembered); it files straight into{" "}
            {resolved?.name ?? "the token's project"}.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            disabled={realLoaded || !resolved}
            onClick={loadRealWidget}
          >
            {realLoaded ? "Loaded — look bottom-right" : "Load widget.js"}
          </Button>
        </div>
      </section>
    </>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  )
}

function structuralSelector(el: HTMLElement) {
  const tag = el.tagName.toLowerCase()
  const parent = el.parentElement
  if (!parent) return tag
  const sameTag = [...parent.children].filter((c) => c.tagName === el.tagName)
  if (sameTag.length <= 1) return tag
  const idx = sameTag.indexOf(el) + 1
  return `${tag}:nth-of-type(${idx})`
}

function fallbackShot(selector: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">
    <rect width="960" height="540" fill="#f4f4f5"/>
    <rect x="0" y="0" width="960" height="44" fill="#e4e4e7"/>
    <circle cx="24" cy="22" r="5" fill="#f87171"/><circle cx="44" cy="22" r="5" fill="#fbbf24"/><circle cx="64" cy="22" r="5" fill="#34d399"/>
    <text x="96" y="27" font-family="monospace" font-size="13" fill="#71717a">demo.tesuto.app</text>
    <text x="40" y="120" font-family="sans-serif" font-size="22" font-weight="600" fill="#18181b">Screenshot capture unavailable</text>
    <text x="40" y="150" font-family="monospace" font-size="13" fill="#a1a1aa">${escapeXml(selector)}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function escapeXml(s: string) {
  return s.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c,
  )
}
