"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { GithubIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { formatDuration, hoursBetween } from "@/lib/analytics"
import { useStore } from "@/lib/store"
import { ROLE_META } from "@/lib/types"
import { initials } from "@/lib/utils"

export default function ProfilePage() {
  const { currentUser, updateProfile, tickets, githubConnected } = useStore()

  const [name, setName] = useState(currentUser.name)
  const [title, setTitle] = useState(currentUser.title ?? "")
  const [bio, setBio] = useState(currentUser.bio ?? "")

  const mine = tickets.filter((t) => t.assigneeId === currentUser.id)
  const reported = tickets.filter((t) => t.reporterId === currentUser.id)
  const resolved = mine.filter((t) => !!t.resolvedAt)
  const resolveTimes = resolved
    .map((t) => hoursBetween(t.assignedAt ?? t.createdAt, t.resolvedAt))
    .filter((h): h is number => h != null && h >= 0)
  const avgResolve = resolveTimes.length
    ? resolveTimes.reduce((s, h) => s + h, 0) / resolveTimes.length
    : null

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

  const stats = [
    { label: "Assigned to me", value: mine.length },
    { label: "Open", value: mine.filter((t) => !t.resolvedAt).length },
    { label: "Resolved", value: resolved.length },
    { label: "Reported", value: reported.length },
    { label: "Avg time to resolve", value: formatDuration(avgResolve) },
  ]

  return (
    <>
      <AppHeader
        title="Your profile"
        description="How you show up across Tesuto"
      />
      <div className="flex w-full max-w-3xl flex-col gap-10 p-4 md:p-8">
        <section className="flex items-center gap-4">
          <span
            className="flex size-16 items-center justify-center rounded-2xl text-lg font-semibold text-white"
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

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col gap-1 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
            >
              <span className="text-lg font-semibold tabular-nums">
                {s.value}
              </span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </section>

        <Separator />

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">Details</h2>
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
        </section>

        <Separator />

        <section className="flex items-center gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
            <GithubIcon className="size-5" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">GitHub</span>
            <span className="text-sm text-muted-foreground">
              {githubConnected
                ? `Connected as ${currentUser.githubLogin ?? "you"}`
                : "Not connected"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            render={<Link href="/settings" />}
          >
            Manage in Settings
          </Button>
        </section>
      </div>
    </>
  )
}
