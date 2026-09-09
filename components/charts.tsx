"use client"

import { useId, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ *
 * Small, dependency-free chart primitives. Marks follow the dataviz
 * method: thin marks, rounded data-ends, recessive axes, a legend for
 * ≥2 series, and a hover layer that is a floating tooltip — never a
 * reflow. Series colour comes from Tesuto's --chart-N tokens, fixed order.
 * ------------------------------------------------------------------ */

export const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

type TipState = { x: number; y: number; node: React.ReactNode } | null

function Tooltip({ tip }: { tip: TipState }) {
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-popover px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-foreground/10 transition-opacity duration-100"
      style={{
        left: tip?.x ?? 0,
        top: (tip?.y ?? 0) - 8,
        opacity: tip ? 1 : 0,
      }}
      aria-hidden={!tip}
    >
      {tip?.node}
    </div>
  )
}

export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className="text-2xl font-semibold tracking-tight"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
}

type BarRow = { label: string; value: number; color?: string; sub?: string }

export function BarChart({
  data,
  unit = "",
  className,
}: {
  data: BarRow[]
  unit?: string
  className?: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const [tip, setTip] = useState<TipState>(null)
  const ref = useRef<HTMLDivElement>(null)

  function show(e: React.MouseEvent, row: BarRow) {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setTip({
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      node: (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            {row.label}: {row.value}
            {unit}
          </span>
          {row.sub ? (
            <span className="text-muted-foreground">{row.sub}</span>
          ) : null}
        </div>
      ),
    })
  }

  return (
    <div
      ref={ref}
      className={cn("relative flex flex-col gap-2.5", className)}
      onMouseLeave={() => setTip(null)}
    >
      <Tooltip tip={tip} />
      {data.map((row, i) => (
        <div
          key={row.label}
          className="grid grid-cols-[7rem_minmax(0,1fr)_2.5rem] items-center gap-3"
          onMouseMove={(e) => show(e, row)}
        >
          <span className="truncate text-right text-xs text-muted-foreground">
            {row.label}
          </span>
          <div className="relative h-5 rounded bg-muted/60">
            <div
              className="absolute inset-y-0 left-0 rounded transition-[width] duration-500"
              style={{
                width: `${Math.max((row.value / max) * 100, row.value > 0 ? 3 : 0)}%`,
                background: row.color ?? SERIES[i % SERIES.length],
              }}
            />
          </div>
          <span className="text-right text-xs font-medium tabular-nums">
            {row.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

type Series = { name: string; color: string; points: number[] }

export function LineChart({
  labels,
  series,
  height = 180,
}: {
  labels: string[]
  series: Series[]
  height?: number
}) {
  const gradId = useId()
  const w = 640
  const h = height
  const padL = 28
  const padB = 22
  const padT = 10
  const padR = 8
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const max = Math.max(1, ...series.flatMap((s) => s.points))
  const n = labels.length
  const [hover, setHover] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tipX, setTipX] = useState(0)

  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW)
  const y = (v: number) => padT + innerH - (v / max) * innerH

  const ticks = [...new Set([0, Math.round(max / 2), max])]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs">
        {series.map((s) => (
          <span
            key={s.name}
            className="flex items-center gap-1.5 text-muted-foreground"
          >
            <span
              className="h-0.5 w-3 rounded-full"
              style={{ background: s.color }}
            />
            {s.name}
          </span>
        ))}
      </div>
      <div ref={wrapRef} className="relative overflow-x-auto">
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-popover px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-foreground/10 transition-opacity duration-100"
          style={{ left: tipX, top: 4, opacity: hover != null ? 1 : 0 }}
          aria-hidden={hover == null}
        >
          {hover != null ? (
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{labels[hover]}</span>
              {series.map((s) => (
                <span
                  key={s.name}
                  className="flex items-center gap-1.5 text-muted-foreground"
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.name} {s.points[hover]}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full min-w-[32rem]"
          role="img"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={series[0]?.color}
                stopOpacity="0.18"
              />
              <stop
                offset="100%"
                stopColor={series[0]?.color}
                stopOpacity="0"
              />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={padL}
                x2={w - padR}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={padL - 6}
                y={y(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize="10"
              >
                {t}
              </text>
            </g>
          ))}

          {series[0] ? (
            <path
              d={`M ${x(0)} ${y(series[0].points[0])} ${series[0].points
                .map((p, i) => `L ${x(i)} ${y(p)}`)
                .join(" ")} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`}
              fill={`url(#${gradId})`}
            />
          ) : null}

          {series.map((s) => (
            <polyline
              key={s.name}
              points={s.points.map((p, i) => `${x(i)},${y(p)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {hover != null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padT}
              y2={padT + innerH}
              stroke="var(--muted-foreground)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          ) : null}
          {hover != null
            ? series.map((s) => (
                <circle
                  key={s.name}
                  cx={x(hover)}
                  cy={y(s.points[hover])}
                  r="3.5"
                  fill="var(--card)"
                  stroke={s.color}
                  strokeWidth="2"
                />
              ))
            : null}

          {labels.map((label, i) =>
            i % Math.ceil(n / 8) === 0 ? (
              <text
                key={label + i}
                x={x(i)}
                y={h - 6}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="10"
              >
                {label}
              </text>
            ) : null,
          )}

          {labels.map((_, i) => (
            <rect
              key={i}
              x={x(i) - innerW / (n * 2)}
              y={padT}
              width={innerW / n}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => {
                setHover(i)
                const box = wrapRef.current?.getBoundingClientRect()
                const svgEl = wrapRef.current?.querySelector("svg")
                if (box && svgEl) {
                  setTipX((x(i) / w) * svgEl.clientWidth)
                }
              }}
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[]
  centerLabel?: string
  centerValue?: string
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
  const r = 52
  const c = 2 * Math.PI * r
  const [tip, setTip] = useState<TipState>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Cumulative arc start for each segment, computed up front (no mutation
  // during render).
  const offsets = segments.reduce<number[]>((acc, _seg, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + (segments[i - 1].value / total) * c)
    return acc
  }, [])

  function show(e: React.MouseEvent, seg: { label: string; value: number }) {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setTip({
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      node: (
        <span className="font-medium">
          {seg.label}: {seg.value} · {Math.round((seg.value / total) * 100)}%
        </span>
      ),
    })
  }

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-6">
      <Tooltip tip={tip} />
      <svg
        viewBox="0 0 140 140"
        className="size-36 shrink-0 -rotate-90"
        onMouseLeave={() => setTip(null)}
      >
        {segments.map((seg, i) => {
          const dash = (seg.value / total) * c
          return (
            <circle
              key={seg.label}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="16"
              strokeDasharray={`${Math.max(dash - 2, 0)} ${c}`}
              strokeDashoffset={-offsets[i]}
              strokeLinecap="butt"
              onMouseMove={(e) => show(e, seg)}
            />
          )
        })}
      </svg>
      <div className="flex flex-col gap-1.5" onMouseLeave={() => setTip(null)}>
        {centerValue ? (
          <div className="mb-1">
            <div className="text-2xl font-semibold tracking-tight tabular-nums">
              {centerValue}
            </div>
            {centerLabel ? (
              <div className="text-xs text-muted-foreground">{centerLabel}</div>
            ) : null}
          </div>
        ) : null}
        {segments.map((seg) => (
          <span
            key={seg.label}
            className="flex items-center gap-2 text-xs"
            onMouseMove={(e) => show(e, seg)}
          >
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: seg.color }}
            />
            <span>{seg.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {seg.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
