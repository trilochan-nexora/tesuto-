"use client"

import { ArrowUpRight, MapPin, Square, Trash2 } from "lucide-react"
import { useCallback, useId, useRef, useState } from "react"
import { ANNOTATION_COLORS, type Annotation } from "@/lib/types"
import { cn } from "@/lib/utils"

let seq = 0
const uid = () => `an_${Date.now()}_${seq++}`

type Drag =
  | {
      id: string
      mode: "move"
      startX: number
      startY: number
      origX: number
      origY: number
    }
  | {
      id: string
      mode: "resize"
      startX: number
      startY: number
      origW: number
      origH: number
    }
  | null

export function ScreenshotEditor({
  src,
  annotations,
  onChange,
  editable = false,
  className,
}: {
  src: string
  annotations: Annotation[]
  onChange?: (next: Annotation[]) => void
  editable?: boolean
  className?: string
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag>(null)
  const markerId = useId()
  const [selected, setSelected] = useState<string | null>(null)
  const [lastColor, setLastColor] = useState<string>(ANNOTATION_COLORS[0])

  const active = annotations.find((a) => a.id === selected) ?? null

  const patch = useCallback(
    (id: string, next: Partial<Annotation>) => {
      onChange?.(annotations.map((a) => (a.id === id ? { ...a, ...next } : a)))
    },
    [annotations, onChange],
  )

  function add(kind: Annotation["kind"]) {
    const base: Annotation =
      kind === "pin"
        ? { id: uid(), kind, x: 0.5, y: 0.4, w: 0, h: 0, color: lastColor }
        : {
            id: uid(),
            kind,
            x: 0.32,
            y: 0.32,
            w: 0.34,
            h: kind === "arrow" ? 0.16 : 0.24,
            color: lastColor,
          }
    onChange?.([...annotations, base])
    setSelected(base.id)
  }

  function remove(id: string) {
    onChange?.(annotations.filter((a) => a.id !== id))
    setSelected(null)
  }

  function onPointerDown(
    e: React.PointerEvent,
    a: Annotation,
    mode: "move" | "resize",
  ) {
    if (!editable) return
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setSelected(a.id)
    dragRef.current =
      mode === "move"
        ? {
            id: a.id,
            mode,
            startX: e.clientX,
            startY: e.clientY,
            origX: a.x,
            origY: a.y,
          }
        : {
            id: a.id,
            mode,
            startX: e.clientX,
            startY: e.clientY,
            origW: a.w,
            origH: a.h,
          }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    const frame = frameRef.current
    if (!drag || !frame) return
    const rect = frame.getBoundingClientRect()
    const dx = (e.clientX - drag.startX) / rect.width
    const dy = (e.clientY - drag.startY) / rect.height
    const a = annotations.find((an) => an.id === drag.id)
    if (!a) return
    if (drag.mode === "move") {
      const maxX = a.kind === "pin" ? 1 : 1 - a.w
      const maxY = a.kind === "pin" ? 1 : 1 - a.h
      patch(drag.id, {
        x: clamp(drag.origX + dx, 0, Math.max(maxX, 0)),
        y: clamp(drag.origY + dy, 0, Math.max(maxY, 0)),
      })
    } else {
      patch(drag.id, {
        w: clamp(drag.origW + dx, 0.04, 1 - a.x),
        h: clamp(drag.origH + dy, 0.04, 1 - a.y),
      })
    }
  }

  function onPointerUp() {
    dragRef.current = null
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => add("box")}
            className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-muted/70"
          >
            <Square className="size-3.5" />
            Box
          </button>
          <button
            type="button"
            onClick={() => add("arrow")}
            className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-muted/70"
          >
            <ArrowUpRight className="size-3.5" />
            Arrow
          </button>
          <button
            type="button"
            onClick={() => add("pin")}
            className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-muted/70"
          >
            <MapPin className="size-3.5" />
            Pin
          </button>

          <div className="flex items-center gap-1">
            {ANNOTATION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => {
                  setLastColor(c)
                  if (active) patch(active.id, { color: c })
                }}
                className={cn(
                  "size-4 rounded-full ring-2 ring-offset-1 ring-offset-background transition-transform",
                  (active?.color ?? lastColor) === c
                    ? "ring-foreground"
                    : "ring-transparent hover:scale-110",
                )}
                style={{ background: c }}
              />
            ))}
          </div>

          {active ? (
            <button
              type="button"
              onClick={() => remove(active.id)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          ) : (
            <span className="ml-auto text-xs text-muted-foreground">
              Click a mark to recolour or label it
            </span>
          )}
        </div>
      ) : null}

      {editable && active ? (
        <input
          value={active.label ?? ""}
          onChange={(e) => patch(active.id, { label: e.target.value })}
          placeholder="Label this mark (optional)…"
          className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring"
        />
      ) : null}

      <div
        ref={frameRef}
        className="relative select-none overflow-hidden rounded-xl ring-1 ring-foreground/10"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => setSelected(null)}
      >
        <img
          src={src}
          alt="Report screenshot"
          className="block w-full"
          draggable={false}
        />

        {/* Arrowhead marker */}
        <svg className="pointer-events-none absolute size-0">
          <title>arrow markers</title>
          <defs>
            {annotations
              .filter((a) => a.kind === "arrow")
              .map((a) => (
                <marker
                  key={a.id}
                  id={`${markerId}-${a.id}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={a.color} />
                </marker>
              ))}
          </defs>
        </svg>

        {annotations.map((a) => {
          if (a.kind === "pin") {
            return (
              <button
                key={a.id}
                type="button"
                onPointerDown={(e) => onPointerDown(e, a, "move")}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelected(a.id)
                }}
                className={cn(
                  "absolute flex -translate-x-1/2 -translate-y-full flex-col items-center",
                  editable
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-default",
                )}
                style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
                aria-label="Annotation pin"
              >
                {a.label ? (
                  <span
                    className="mb-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                    style={{ background: a.color }}
                  >
                    {a.label}
                  </span>
                ) : null}
                <MapPin
                  className="size-6 drop-shadow"
                  style={{ color: a.color, fill: a.color }}
                  strokeWidth={1.5}
                />
              </button>
            )
          }

          if (a.kind === "arrow") {
            return (
              <div
                key={a.id}
                onPointerDown={(e) => onPointerDown(e, a, "move")}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelected(a.id)
                }}
                className={cn(
                  "absolute",
                  editable && "cursor-grab active:cursor-grabbing",
                )}
                style={{
                  left: `${a.x * 100}%`,
                  top: `${a.y * 100}%`,
                  width: `${a.w * 100}%`,
                  height: `${a.h * 100}%`,
                }}
              >
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="100%"
                    y2="100%"
                    stroke={a.color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    markerEnd={`url(#${markerId}-${a.id})`}
                  />
                </svg>
                {a.label ? (
                  <span
                    className="absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                    style={{ background: a.color }}
                  >
                    {a.label}
                  </span>
                ) : null}
                {editable ? (
                  <span
                    onPointerDown={(e) => onPointerDown(e, a, "resize")}
                    className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-background"
                    style={{ background: a.color }}
                  />
                ) : null}
              </div>
            )
          }

          return (
            <div
              key={a.id}
              onPointerDown={(e) => onPointerDown(e, a, "move")}
              onClick={(e) => {
                e.stopPropagation()
                setSelected(a.id)
              }}
              className={cn(
                "absolute rounded-md",
                editable && "cursor-grab active:cursor-grabbing",
              )}
              style={{
                left: `${a.x * 100}%`,
                top: `${a.y * 100}%`,
                width: `${a.w * 100}%`,
                height: `${a.h * 100}%`,
                border: `2px solid ${a.color}`,
                background: `${a.color}1f`,
                boxShadow:
                  selected === a.id ? `0 0 0 2px ${a.color}` : undefined,
              }}
            >
              {a.label ? (
                <span
                  className="absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                  style={{ background: a.color }}
                >
                  {a.label}
                </span>
              ) : null}
              {editable ? (
                <span
                  onPointerDown={(e) => onPointerDown(e, a, "resize")}
                  className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-background"
                  style={{ background: a.color }}
                />
              ) : null}
            </div>
          )
        })}

        {editable && annotations.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
              Add a box, arrow, or pin to mark the problem
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
}
