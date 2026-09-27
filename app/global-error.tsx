"use client"

// Last-resort boundary for errors in the root layout itself. It replaces the
// whole document, so it can't rely on globals.css, fonts, or providers.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fdfdfd",
          color: "#1a1a1a",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>
            Tesuto couldn&apos;t load
          </h1>
          <p style={{ fontSize: 14, color: "#666", margin: "0 0 16px" }}>
            Something went wrong before the app could start.
            {error.digest ? ` Ref ${error.digest}.` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "#1a1a1a",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
