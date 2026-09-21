"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { GithubIcon } from "@/components/icons"
import { UserAvatar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useStore } from "@/lib/store"
import type { IntegrationKey } from "@/lib/types"

const INTEGRATION_ROWS: {
  key: IntegrationKey
  label: string
  description: string
  requiresEnv?: string
}[] = [
  {
    key: "slack",
    label: "Slack notifications",
    description:
      "Post ticket activity (created, assigned, resolved, commented) to the team Slack channel.",
    requiresEnv: "SLACK_WEBHOOK_URL",
  },
  {
    key: "email",
    label: "Email notifications",
    description:
      "Email the assignee when a ticket is created, assigned, resolved, or commented on.",
    requiresEnv: "RESEND_API_KEY + EMAIL_FROM",
  },
  {
    key: "githubSync",
    label: "GitHub sync",
    description:
      "Per-ticket “Sync to GitHub” — opens an issue under the syncing teammate's own account.",
  },
  {
    key: "githubProjects",
    label: "GitHub Projects import",
    description:
      "Import GitHub Projects (v2) boards as new Tesuto projects via each teammate's connection.",
    requiresEnv: "GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET",
  },
  {
    key: "clickup",
    label: "ClickUp import",
    description:
      "Import ClickUp lists as new Tesuto projects (API token pasted per import, never stored).",
  },
  {
    key: "hearthReleases",
    label: "Hearth release notes",
    description:
      "Show prod API releases posted in from Hearth's CI on the Releases page.",
    requiresEnv: "HEARTH_RELEASES_SECRET",
  },
]

export default function SettingsPage() {
  const {
    currentUser,
    githubConnected,
    connectGithub,
    disconnectGithub,
    integrations,
    updateIntegration,
    isAdmin,
  } = useStore()

  // The OAuth callback redirects back here with the result.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get("github")
    if (!result) return
    if (result === "connected") {
      toast.success(`GitHub connected as ${params.get("login") ?? "you"}`)
    } else if (result === "error") {
      toast.error(params.get("msg") ?? "GitHub connection failed")
    } else if (result === "cancelled") {
      toast.info("GitHub connection was cancelled")
    } else if (result === "invalid_state") {
      toast.error("That GitHub link expired — try again")
    }
    window.history.replaceState(null, "", "/settings")
  }, [])

  return (
    <>
      <AppHeader
        title="Settings"
        description="Your profile and connected accounts"
      />
      <div className="flex w-full max-w-2xl flex-col gap-10 p-4 md:p-8">
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">Profile</h2>
          <div className="flex items-center gap-4">
            <UserAvatar user={currentUser} className="size-12 text-sm" />
            <div className="flex flex-col">
              <span className="font-medium">{currentUser.name}</span>
              <span className="text-sm text-muted-foreground">
                {currentUser.email}
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Tesuto signs you in with the shared company session — there is no
            separate password to manage.
          </p>
        </section>

        <Separator />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">Connections</h2>
            <p className="text-sm text-muted-foreground">
              Link your own GitHub account so ticket syncs open issues as you,
              not a shared bot. Each project still needs a repo set (project →
              settings).
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-xl bg-muted/40 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
              <GithubIcon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">GitHub</span>
              <span className="text-sm text-muted-foreground">
                {githubConnected
                  ? `Connected as ${currentUser.githubLogin ?? "you"}`
                  : "Not connected"}
              </span>
            </div>
            {githubConnected ? (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  disconnectGithub()
                  toast.success("GitHub disconnected")
                }}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => connectGithub()}
              >
                Connect
              </Button>
            )}
          </div>
        </section>

        {isAdmin ? (
          <>
            <Separator />

            <section className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-semibold">Integrations</h2>
                <p className="text-sm text-muted-foreground">
                  Workspace-wide switches. Slack and email also need their env
                  vars set on the server to actually send.
                </p>
              </div>

              {INTEGRATION_ROWS.map((row) => {
                const toggle = integrations[row.key]
                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-4 rounded-xl bg-muted/40 p-4"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium">{row.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {row.description}
                        {!toggle.available ? (
                          <>
                            {" "}
                            <span className="font-medium text-amber-600 dark:text-amber-400">
                              Not configured — set {row.requiresEnv} on the
                              server.
                            </span>
                          </>
                        ) : null}
                      </span>
                    </div>
                    <Switch
                      className="ml-auto"
                      aria-label={`Enable ${row.label}`}
                      checked={toggle.enabled && toggle.available}
                      disabled={!toggle.available}
                      onCheckedChange={(enabled) =>
                        updateIntegration(row.key, enabled)
                      }
                    />
                  </div>
                )
              })}
            </section>
          </>
        ) : null}
      </div>
    </>
  )
}
