import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

const title = "Tesuto — Bug reporting & ticket tracking"
const description =
  "Point-at-the-UI bug reporting, a fast kanban board, per-ticket comments, and per-user GitHub sync. The internal tracker your team actually enjoys."

// APP_URL is admin-configured, not hardcoded — a malformed value must not
// throw at module load and take the whole app down with it.
function metadataBase(): URL {
  try {
    return new URL(process.env.APP_URL ?? "http://localhost:3005")
  } catch {
    return new URL("http://localhost:3005")
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title,
  description,
  icons: {
    icon: [
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title,
    description,
    siteName: "Tesuto",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#181622" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions (ColorZilla, Grammarly,
          password managers) inject attributes on <body> before React hydrates */}
      <body
        suppressHydrationWarning
        className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
