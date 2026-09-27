import type { SVGProps } from "react"

/**
 * The Tesuto mark — a bold "T" monogram. Mirrors public/icon.svg so the
 * favicon and the in-app badge (sidebar, header, 404) are the same logo.
 */
export function TesutoMark({
  width = "1em",
  height = "1em",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={width}
      height={height}
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <rect x="4" y="5" width="16" height="3.2" rx="1.2" />
      <rect x="10.4" y="5" width="3.2" height="14" rx="1.2" />
    </svg>
  )
}

/**
 * ClickUp mark — not in the Phosphor set, so Tesuto ships a simplified one
 * (their double-chevron "CU" glyph). Sized like a lucide/Phosphor icon.
 */
export function ClickUpIcon({
  width = "1em",
  height = "1em",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={width}
      height={height}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M7 15.5 12 11l5 4.5" />
      <path d="M9.5 18.5 12 16.3l2.5 2.2" />
    </svg>
  )
}

/**
 * GitHub mark. lucide-react dropped brand glyphs in v1, so Tesuto ships its own.
 * Sized via `className` / `width` like a lucide icon (defaults to 1em).
 */
export function GithubIcon({
  width = "1em",
  height = "1em",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={width}
      height={height}
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58l-.01-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.22.7.83.58A12 12 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
    </svg>
  )
}
