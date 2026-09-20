"use client"

import { Globe, KeyRound, SquareKanban, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { notFound, useRouter } from "next/navigation"
import { use, useState } from "react"
import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { CopyableCode, embedSnippet } from "@/components/embed-snippet"
import { GithubIcon } from "@/components/icons"
import { PageBack } from "@/components/page-back"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useStore } from "@/lib/store"

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { getProject, tickets, projects, deleteProject, updateProject } =
    useStore()
  const router = useRouter()
  const project = getProject(id)
  const [repo, setRepo] = useState(project?.githubRepo ?? "")

  if (!project) notFound()
  const projectId = project.id

  const count = tickets.filter((t) => t.projectId === projectId).length

  function saveRepo() {
    const value = repo.trim()
    updateProject(projectId, { githubRepo: value || undefined })
    toast.success(
      value
        ? `Issues will open in ${value}`
        : "GitHub repo cleared — sync is disabled for this project",
    )
  }

  return (
    <>
      <AppHeader
        title={`${project.name} · setup`}
        description="Widget token and embed"
      />

      <div className="flex w-full max-w-2xl flex-col gap-8 p-4 md:p-8">
        <PageBack href={`/projects/${project.id}`} label="Back to board" />
        <section className="flex items-center gap-4">
          <span
            className="flex size-12 items-center justify-center rounded-xl text-base font-semibold text-white"
            style={{ backgroundColor: project.color }}
          >
            {project.key.slice(0, 2)}
          </span>
          <div className="flex flex-col">
            <span className="font-medium">{project.name}</span>
            <span className="text-sm text-muted-foreground">
              {project.description || "No description"}
            </span>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
            <SquareKanban className="size-4" />
            {count} {count === 1 ? "ticket" : "tickets"}
          </span>
        </section>

        <Separator />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="size-4" />
              Widget token
            </h2>
            <p className="text-sm text-muted-foreground">
              The embedded widget presents this token to authenticate every
              report against <span className="font-medium">{project.name}</span>
              . It is publishable — safe to ship in client-side HTML — and only
              grants <code className="text-xs">create:ticket</code> on this
              project.
            </p>
          </div>
          <CopyableCode code={project.token} label="Project token" />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Globe className="size-4" />
              Embed on any site
            </h2>
            <p className="text-sm text-muted-foreground">
              Drop this into the <code className="text-xs">&lt;head&gt;</code>{" "}
              of any app — Kairo, Levi, a marketing page, a customer&apos;s
              site. No npm dependency, no redeploy to pick up widget updates.
              The same token works across every origin you embed it on.
            </p>
          </div>
          <CopyableCode code={embedSnippet(project.token)} label="Snippet" />
          <p className="text-xs text-muted-foreground">
            <code className="text-xs">/widget.js</code> is a real,
            dependency-free script — this demo ships it. Testing on this app
            itself? Use{" "}
            <code className="text-xs">src=&quot;/widget.js&quot;</code>. Try it
            on the{" "}
            <Link href="/widget" className="text-primary hover:underline">
              widget page
            </Link>
            .
          </p>
        </section>

        <Separator />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <GithubIcon className="size-4" />
              GitHub sync
            </h2>
            <p className="text-sm text-muted-foreground">
              The repo where tickets synced from this project open issues. Each
              teammate syncs under their own GitHub account — connect yours in{" "}
              <Link href="/settings" className="text-primary hover:underline">
                Settings
              </Link>
              .
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRepo()
              }}
              placeholder="owner/repo"
              className="max-w-64"
              aria-label="GitHub repository"
            />
            <Button size="sm" onClick={saveRepo}>
              Save
            </Button>
          </div>
        </section>

        <Separator />

        <section className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <TriangleAlert className="size-4" />
              Delete project
            </h2>
            <p className="text-sm text-muted-foreground">
              Permanently removes{" "}
              <span className="font-medium">{project.name}</span>, its {count}{" "}
              {count === 1 ? "ticket" : "tickets"}, and its widget token.
              Documents stay but lose their project link.
            </p>
          </div>
          <ConfirmDialog
            title={`Delete ${project.name}?`}
            description={`This can't be undone. ${count} ${count === 1 ? "ticket" : "tickets"} will be deleted.`}
            confirmWord={project.key}
            confirmLabel="Delete project"
            onConfirm={() => {
              deleteProject(project.id)
              toast.success(`Deleted ${project.name}`)
              router.push("/projects")
            }}
            trigger={
              <Button
                variant="destructive"
                size="sm"
                className="w-fit"
                disabled={projects.length <= 1}
              >
                Delete this project
              </Button>
            }
          />
          {projects.length <= 1 ? (
            <p className="text-xs text-muted-foreground">
              You can&apos;t delete the last project.
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
