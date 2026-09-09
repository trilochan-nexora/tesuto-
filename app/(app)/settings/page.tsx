"use client"

import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { GithubIcon } from "@/components/icons"
import { UserAvatar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useStore } from "@/lib/store"

export default function SettingsPage() {
  const { currentUser, githubConnected, connectGithub, disconnectGithub } =
    useStore()

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
              not a shared bot.
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
                onClick={() => {
                  connectGithub()
                  toast.success("GitHub connected", {
                    description:
                      "Ticket syncs will open issues under your account.",
                  })
                }}
              >
                Connect
              </Button>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
