/**
 * Stand-in "customer apps" for the widget demo. Each scene is a real bit of
 * UI (with `data-pick` targets) plus a `bug` the widget genuinely observes —
 * a real thrown Error and a real failed fetch — so the ticket's captured
 * context is not faked.
 */

export type WidgetTelemetry = {
  consoleErrors: string[]
  failedRequests: string[]
}

export type WidgetScene = {
  id: string
  label: string
  path: string
  Mock: () => React.ReactNode
  bug: () => Promise<WidgetTelemetry>
}

async function observe(
  throwing: () => unknown,
  req: { method: string; path: string; status: number },
): Promise<WidgetTelemetry> {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  try {
    throwing()
  } catch (e) {
    const err = e as Error
    consoleErrors.push(`${err.name}: ${err.message}`)
  }
  // A genuinely failing request — the `.invalid` TLD (RFC 2606) never
  // resolves, so this rejects without hitting the dev server's router.
  // The displayed status is the API failure the scene represents.
  try {
    await fetch("https://api.tesuto-demo.invalid/probe", { method: req.method })
  } catch {
    failedRequests.push(`${req.method} ${req.path} → ${req.status}`)
  }
  return { consoleErrors, failedRequests }
}

function Cell({ children }: { children: React.ReactNode }) {
  return <span className="text-sm">{children}</span>
}

export const WIDGET_SCENES: WidgetScene[] = [
  {
    id: "billing",
    label: "Billing",
    path: "/billing/invoices/8842",
    Mock: () => (
      <div className="grid gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_16rem] sm:p-8">
        <div className="flex flex-col gap-5">
          <h2
            data-pick
            data-testid="page-heading"
            className="text-xl font-semibold"
          >
            Billing overview
          </h2>
          <div
            data-pick
            data-testid="invoice-total"
            className="rounded-xl border border-border bg-background p-4"
          >
            <p className="text-sm text-muted-foreground">Amount due</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600">
              $NaN
            </p>
          </div>
          <p
            data-pick
            className="text-sm leading-relaxed text-muted-foreground"
          >
            Your plan renews on the 1st. Partial refunds are reconciled against
            the server total within a few minutes.
          </p>
          <button
            type="button"
            data-pick
            data-testid="submit-refund"
            className="w-fit rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Request a refund
          </button>
        </div>
        <aside className="flex flex-col gap-3">
          <div
            data-pick
            data-testid="plan-card"
            className="rounded-xl border border-border bg-background p-4"
          >
            <p className="text-sm font-medium">Team plan</p>
            <p className="mt-1 text-xs text-muted-foreground">
              12 seats · monthly
            </p>
          </div>
          <span
            data-pick
            data-testid="billing-history"
            className="w-fit cursor-pointer text-sm text-primary hover:underline"
          >
            View billing history
          </span>
        </aside>
      </div>
    ),
    bug: () =>
      observe(
        () => {
          const invoice: { total?: { amount: number } } = { total: undefined }
          // Real TypeError: Cannot read properties of undefined (reading 'amount')
          return (invoice.total as { amount: number }).amount
        },
        { method: "GET", path: "/api/invoices/8842/refunds", status: 500 },
      ),
  },
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/dashboard",
    Mock: () => (
      <div className="flex flex-col gap-5 p-6 sm:p-8">
        <h2
          data-pick
          data-testid="dash-heading"
          className="text-xl font-semibold"
        >
          This week
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { k: "Sign-ups", v: "1,204" },
            { k: "Revenue", v: "$—" },
            { k: "Churn", v: "2.1%" },
          ].map((s) => (
            <div
              key={s.k}
              data-pick
              data-testid={`stat-${s.k.toLowerCase()}`}
              className="rounded-xl border border-border bg-background p-4"
            >
              <p className="text-xs text-muted-foreground">{s.k}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{s.v}</p>
            </div>
          ))}
        </div>
        <div
          data-pick
          data-testid="revenue-chart"
          className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-background text-sm text-muted-foreground"
        >
          Chart failed to render
        </div>
      </div>
    ),
    bug: () =>
      observe(
        () => {
          // Real RangeError: Invalid array length
          return new Array(-1)
        },
        { method: "GET", path: "/api/metrics/timeseries", status: 504 },
      ),
  },
  {
    id: "settings",
    label: "Team settings",
    path: "/settings/team",
    Mock: () => (
      <div className="flex flex-col gap-4 p-6 sm:p-8">
        <h2
          data-pick
          data-testid="settings-heading"
          className="text-xl font-semibold"
        >
          Team members
        </h2>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {[
              ["Ava Reyes", "Admin"],
              ["Marcus Lin", "Member"],
              ["Priya Nair", "Member"],
            ].map(([n, r]) => (
              <tr
                key={n}
                data-pick
                data-testid={`row-${n}`}
                className="border-b"
              >
                <td className="py-2">
                  <Cell>{n}</Cell>
                </td>
                <td className="py-2">
                  <Cell>{r}</Cell>
                </td>
                <td className="py-2 text-right">
                  <span
                    data-pick
                    data-testid={`remove-${n}`}
                    className="cursor-pointer text-xs text-destructive hover:underline"
                  >
                    Remove
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Removing a member takes effect immediately.
        </p>
      </div>
    ),
    bug: () =>
      observe(
        () => {
          const members = { list: [] } as unknown as unknown[]
          // Real TypeError: members.filter is not a function
          return (members as { filter: (f: unknown) => unknown }).filter(
            Boolean,
          )
        },
        { method: "PATCH", path: "/api/team/members/u3", status: 403 },
      ),
  },
]

export function detectClient() {
  if (typeof navigator === "undefined") {
    return { browser: "Unknown", os: "Unknown" }
  }
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser"
  const os = /Mac OS X/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /Linux/.test(ua)
          ? "Linux"
          : "Unknown"
  return { browser, os }
}
