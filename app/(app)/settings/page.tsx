"use client"

import {
  EnvelopeSimpleIcon,
  RssIcon,
  SlackLogoIcon,
} from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import type { SVGProps } from "react"
import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { ClickUpIcon, GithubIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  isSoundEnabled,
  playChime,
  setSoundEnabled,
} from "@/lib/notification-sound"
import { useStore } from "@/lib/store"
import { type IntegrationKey, ROLE_META } from "@/lib/types"
import { cn, initials } from "@/lib/utils"

const INTEGRATION_ROWS: {
  key: IntegrationKey
  label: string
  description: string
  requiresEnv?: string
  icon: React.ComponentType<SVGProps<SVGSVGElement>>
  badgeClassName: string
}[] = [
  {
    key: "slack",
    label: "Slack notifications",
    description:
      "Post ticket activity (created, assigned, resolved, commented) to the team Slack channel.",
    requiresEnv: "SLACK_WEBHOOK_URL",
    icon: SlackLogoIcon,
    badgeClassName: "bg-[#4A154B] text-white",
  },
  {
    key: "email",
    label: "Email notifications",
    description:
      "Email the assignee when a ticket is created, assigned, resolved, or commented on.",
    requiresEnv: "RESEND_API_KEY + EMAIL_FROM",
    icon: EnvelopeSimpleIcon,
    badgeClassName: "bg-foreground text-background",
  },
  {
    key: "githubSync",
    label: "GitHub sync",
    description:
      "Per-ticket “Sync to GitHub” — opens an issue under the syncing teammate's own account.",
    icon: GithubIcon,
    badgeClassName: "bg-foreground text-background",
  },
  {
    key: "githubProjects",
    label: "GitHub Projects import",
    description:
      "Import GitHub Projects (v2) boards as new Tesuto projects via each teammate's connection.",
    requiresEnv: "GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET",
    icon: GithubIcon,
    badgeClassName: "bg-foreground text-background",
  },
  {
    key: "clickup",
    label: "ClickUp import",
    description:
      "Import ClickUp lists as new Tesuto projects (API token pasted per import, never stored).",
    icon: ClickUpIcon,
    badgeClassName: "bg-[#7B68EE] text-white",
  },
  {
    key: "hearthReleases",
    label: "Hearth release notes",
    description:
      "Show prod API releases posted in from Hearth's CI on the Releases page.",
    requiresEnv: "HEARTH_RELEASES_SECRET",
    icon: RssIcon,
    badgeClassName: "bg-foreground text-background",
  },
]

export default function SettingsPage() {
  const {
    currentUser,
    updateProfile,
    githubConnected,
    connectGithub,
    disconnectGithub,
    integrations,
    updateIntegration,
    isAdmin,
  } = useStore()

  // Read after mount: localStorage isn't available during SSR.
  const [soundOn, setSoundOn] = useState(true)
  useEffect(() => setSoundOn(isSoundEnabled()), [])
  const [name, setName] = useState(currentUser.name)
  const [title, setTitle] = useState(currentUser.title ?? "")
  const [bio, setBio] = useState(currentUser.bio ?? "")

  const dirty =
    name !== currentUser.name ||
    title !== (currentUser.title ?? "") ||
    bio !== (currentUser.bio ?? "")

  function save() {
    if (!name.trim()) {
      toast.error("Name can't be empty.")
      return
    }
    updateProfile({
      name: name.trim(),
      title: title.trim() || undefined,
      bio: bio.trim() || undefined,
    })
    toast.success("Profile saved")
  }

  // The GitHub OAuth callback redirects back here with the result.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get("github")
    if (!result) return
    // Never echo free text from the URL into a toast — anyone can craft a
    // /settings?github=error&msg=... link and make it read as a Tesuto message.
    if (result === "connected") {
      const login = params.get("login") ?? ""
      const valid = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login)
      toast.success(`GitHub connected as ${valid ? login : "you"}`)
    } else if (result === "error") {
      toast.error("GitHub connection failed — try again")
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
        description="Your profile, connections, and workspace integrations"
      />
      <div className="flex w-full max-w-2xl flex-col gap-6 p-4 md:p-8">
        <section className="flex items-center gap-4">
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white"
            style={{ backgroundColor: currentUser.color }}
          >
            {initials(currentUser.name)}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-lg font-semibold">
              {currentUser.name}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {ROLE_META[currentUser.role].label}
              </span>
            </span>
            <span className="text-sm text-muted-foreground">
              {currentUser.title ? `${currentUser.title} · ` : ""}
              {currentUser.email}
            </span>
          </div>
        </section>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="flex flex-col gap-6 pt-2">
            <div className="flex flex-col gap-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="pf-name">Name</FieldLabel>
                  <Input
                    id="pf-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pf-title">Title</FieldLabel>
                  <Input
                    id="pf-title"
                    placeholder="e.g. Frontend Engineer"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pf-bio">Bio</FieldLabel>
                  <Textarea
                    id="pf-bio"
                    rows={3}
                    placeholder="A sentence about what you work on"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  />
                </Field>
              </FieldGroup>
              <div>
                <Button onClick={save} disabled={!dirty}>
                  Save changes
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                There&apos;s no password — you sign in with a one-time code
                emailed to {currentUser.email}.
              </p>
            </div>

            <div className="flex items-center gap-4 border-t pt-6">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">Notification sound</span>
                <span className="text-sm text-muted-foreground">
                  A short chime when someone comments on, assigns, or moves one
                  of your tickets. Saved for this device only.
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => playChime({ force: true })}
              >
                Test
              </Button>
              <Switch
                aria-label="Notification sound"
                checked={soundOn}
                onCheckedChange={(on) => {
                  setSoundOn(on)
                  setSoundEnabled(on)
                  if (on) playChime({ force: true })
                }}
              />
            </div>

            <div className="border-t pt-6">
              <p className="mb-3 text-sm text-muted-foreground">
                Link your own GitHub account so ticket syncs open issues as
                you, not a shared bot. Each project still needs a repo set
                (project → settings).
              </p>
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
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="flex flex-col gap-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Workspace-wide switches — Slack and email also need their env
              vars set on the server to actually send.
              {isAdmin ? null : " Only admins can flip these."}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {INTEGRATION_ROWS.map((row) => {
                const toggle = integrations[row.key]
                return (
                  <div
                    key={row.key}
                    className="flex flex-col gap-3 rounded-xl bg-muted/40 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          row.badgeClassName,
                        )}
                      >
                        <row.icon className="size-4.5" />
                      </span>
                      <span className="min-w-0 flex-1 font-medium">
                        {row.label}
                      </span>
                      <Switch
                        aria-label={`Enable ${row.label}`}
                        checked={toggle.enabled && toggle.available}
                        disabled={!toggle.available || !isAdmin}
                        onCheckedChange={(enabled) =>
                          updateIntegration(row.key, enabled)
                        }
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {row.description}
                      {!toggle.available ? (
                        <>
                          {" "}
                          <span className="font-medium text-amber-700 dark:text-amber-400">
                            Not configured — set {row.requiresEnv} on the
                            server.
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
