"use client"

import { ListChecks } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { GithubIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api-client"
import { useStore } from "@/lib/store"

type GithubProject = { id: string; title: string; owner: string; items: number }
type ClickupTeam = { id: string; name: string }
type ClickupList = { id: string; name: string; space: string }

/**
 * Pull-imports: creates a new Tesuto project from a GitHub Projects (v2)
 * board or a ClickUp list. Tickets start as tasks; closed ones land resolved.
 */
export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { githubConnected, integrations, importFromGithub, importFromClickUp } =
    useStore()
  const router = useRouter()

  const [step, setStep] = useState<"source" | "github" | "clickup">("source")
  const [busy, setBusy] = useState(false)

  // GitHub Projects
  const [ghProjects, setGhProjects] = useState<GithubProject[]>([])
  const [ghId, setGhId] = useState<string | null>(null)
  const [ghName, setGhName] = useState("")

  // ClickUp
  const [cuToken, setCuToken] = useState("")
  const [cuTeams, setCuTeams] = useState<ClickupTeam[]>([])
  const [cuTeamId, setCuTeamId] = useState<string | null>(null)
  const [cuLists, setCuLists] = useState<ClickupList[]>([])
  const [cuListId, setCuListId] = useState<string | null>(null)

  const ghOff = !integrations.githubProjects.enabled
  const cuOff = !integrations.clickup.enabled
  const ghBoard = ghProjects.find((p) => p.id === ghId)

  function reset() {
    setStep("source")
    setBusy(false)
    setGhProjects([])
    setGhId(null)
    setGhName("")
    setCuToken("")
    setCuTeams([])
    setCuTeamId(null)
    setCuLists([])
    setCuListId(null)
  }

  function close() {
    reset()
    onOpenChange(false)
  }

  async function loadGithubProjects() {
    if (ghOff) {
      toast.error("GitHub Projects import is disabled", {
        description: "An admin can enable it in Settings → Integrations.",
      })
      return
    }
    if (!githubConnected) {
      toast.error("Connect your GitHub account first", {
        description: "Settings → Connections, then re-open this dialog.",
      })
      return
    }
    setBusy(true)
    try {
      const projects = await api.get<GithubProject[]>("/import/github/projects")
      setGhProjects(projects)
      if (!projects.length) {
        toast.info("No GitHub Projects boards are visible to your account")
      }
      setStep("github")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load boards")
    } finally {
      setBusy(false)
    }
  }

  async function runGithubImport() {
    if (!ghId) return
    setBusy(true)
    try {
      const project = await importFromGithub({
        projectId: ghId,
        name: ghName.trim() || undefined,
      })
      toast.success(`Imported ${ghBoard?.title ?? "board"}`, {
        description: `${ghBoard?.items ?? "?"} items pulled into ${project.key}`,
      })
      close()
      router.push(`/projects/${project.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed")
    } finally {
      setBusy(false)
    }
  }

  function openClickup() {
    if (cuOff) {
      toast.error("ClickUp import is disabled", {
        description: "An admin can enable it in Settings → Integrations.",
      })
      return
    }
    // Just reveals the token field — loadClickupTeams() (below) needs a
    // token to already be typed, so it can't also be what gets you here.
    setStep("clickup")
  }

  async function loadClickupTeams() {
    if (cuToken.trim().length < 10) {
      toast.error("Paste a ClickUp API token first")
      return
    }
    setBusy(true)
    try {
      const teams = await api.post<ClickupTeam[]>("/import/clickup/teams", {
        token: cuToken.trim(),
      })
      setCuTeams(teams)
      if (!teams.length) toast.info("That token sees no workspaces")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reach ClickUp")
    } finally {
      setBusy(false)
    }
  }

  async function loadClickupLists() {
    if (!cuTeamId) return
    setBusy(true)
    try {
      const lists = await api.post<ClickupList[]>("/import/clickup/lists", {
        token: cuToken.trim(),
        teamId: cuTeamId,
      })
      setCuLists(lists)
      if (!lists.length) toast.info("That workspace has no lists")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load lists")
    } finally {
      setBusy(false)
    }
  }

  async function runClickupImport() {
    const list = cuLists.find((l) => l.id === cuListId)
    if (!list) {
      toast.error("Pick a list to import")
      return
    }
    setBusy(true)
    try {
      const project = await importFromClickUp({
        token: cuToken.trim(),
        listId: list.id,
        name: list.name,
      })
      toast.success(`Imported ${list.name}`, {
        description: `Pulled into ${project.key}`,
      })
      close()
      router.push(`/projects/${project.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import tickets</DialogTitle>
          <DialogDescription>
            Pull an external board in as a new Tesuto project. Items arrive as
            tasks; closed ones start resolved.
          </DialogDescription>
        </DialogHeader>

        {step === "source" ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={ghOff}
              onClick={loadGithubProjects}
              className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                <GithubIcon className="size-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">GitHub Projects</span>
                <span className="text-sm text-muted-foreground">
                  {ghOff
                    ? "Disabled in Settings → Integrations"
                    : githubConnected
                      ? "Import a board visible to your GitHub account"
                      : "Connect your GitHub account in Settings first"}
                </span>
              </span>
            </button>

            <button
              type="button"
              disabled={cuOff}
              onClick={openClickup}
              className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                <ListChecks className="size-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">ClickUp</span>
                <span className="text-sm text-muted-foreground">
                  {cuOff
                    ? "Disabled in Settings → Integrations"
                    : "Import a list using a pasted API token (never stored)"}
                </span>
              </span>
            </button>
          </div>
        ) : null}

        {step === "github" ? (
          <FieldGroup>
            <Field>
              <FieldLabel>Board</FieldLabel>
              <Select
                value={ghId ?? null}
                onValueChange={(v) => {
                  setGhId(v)
                  const board = ghProjects.find((p) => p.id === v)
                  setGhName(board?.title ?? "")
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={ghBoard?.title ?? "Pick a board"}>
                    {(v: string) => {
                      const board = ghProjects.find((p) => p.id === v)
                      return `${board?.owner ?? ""} · ${board?.title ?? ""} — ${board?.items ?? 0} items`
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ghProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title} — {p.items} items
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {ghBoard ? (
                <p className="text-xs text-muted-foreground">
                  {ghBoard.items} items will import.
                </p>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="imp-gh-name">Project name</FieldLabel>
              <Input
                id="imp-gh-name"
                value={ghName}
                onChange={(e) => setGhName(e.target.value)}
                placeholder="Defaults to the board title"
              />
            </Field>
          </FieldGroup>
        ) : null}

        {step === "clickup" ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="imp-cu-token">ClickUp API token</FieldLabel>
              <Input
                id="imp-cu-token"
                type="password"
                autoComplete="off"
                value={cuToken}
                onChange={(e) => {
                  setCuToken(e.target.value)
                  setCuTeams([])
                  setCuLists([])
                  setCuTeamId(null)
                  setCuListId(null)
                }}
                placeholder="pk_…"
              />
              <p className="text-xs text-muted-foreground">
                Used only for this import and never stored.
              </p>
            </Field>

            <Separator />

            <Field>
              <FieldLabel>Workspace</FieldLabel>
              <div className="flex gap-2">
                <Select
                  value={cuTeamId ?? null}
                  onValueChange={(v) => {
                    setCuTeamId(v)
                    setCuLists([])
                    setCuListId(null)
                  }}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Pick a workspace">
                      {(v: string) =>
                        cuTeams.find((t) => t.id === v)?.name ?? ""
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {cuTeams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !cuToken.trim()}
                  onClick={loadClickupTeams}
                >
                  Load
                </Button>
              </div>
            </Field>

            <Field>
              <FieldLabel>List</FieldLabel>
              <div className="flex gap-2">
                <Select
                  value={cuListId ?? null}
                  onValueChange={(v) => setCuListId(v)}
                  disabled={!cuTeamId || !cuLists.length}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Pick a list">
                      {(v: string) =>
                        cuLists.find((l) => l.id === v)?.name ?? ""
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {cuLists.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} — {l.space}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !cuTeamId}
                  onClick={loadClickupLists}
                >
                  Load
                </Button>
              </div>
            </Field>
          </FieldGroup>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          {step === "github" ? (
            <Button onClick={runGithubImport} disabled={busy || !ghId}>
              {busy ? "Importing…" : "Import board"}
            </Button>
          ) : step === "clickup" ? (
            <Button onClick={runClickupImport} disabled={busy || !cuListId}>
              {busy ? "Importing…" : "Import list"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStep("source")}>
              Back
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
