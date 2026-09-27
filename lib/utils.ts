import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
]

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

export function formatRelativeTime(iso: string) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000
  if (seconds < 45) return "just now"
  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (seconds >= secondsInUnit) {
      return rtf.format(-Math.round(seconds / secondsInUnit), unit)
    }
  }
  return "just now"
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * "Mozilla/5.0 (X11; Linux x86_64) … Chrome/151.0.0.0 Safari/537.36" →
 * "Chrome 151 · Linux". Anything that isn't a raw UA string passes through.
 */
export function describeUserAgent(value: string | undefined | null): string {
  const ua = String(value ?? "")
  if (!/^Mozilla\//.test(ua)) return ua
  const pick = (re: RegExp) => ua.match(re)?.[1]
  const browser =
    (pick(/Edg\/(\d+)/) && `Edge ${pick(/Edg\/(\d+)/)}`) ||
    (pick(/OPR\/(\d+)/) && `Opera ${pick(/OPR\/(\d+)/)}`) ||
    (pick(/Firefox\/(\d+)/) && `Firefox ${pick(/Firefox\/(\d+)/)}`) ||
    (pick(/Chrome\/(\d+)/) && `Chrome ${pick(/Chrome\/(\d+)/)}`) ||
    (pick(/Version\/(\d+).*Safari/) && `Safari ${pick(/Version\/(\d+).*Safari/)}`) ||
    "Browser"
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : ""
  return os ? `${browser} · ${os}` : browser
}
