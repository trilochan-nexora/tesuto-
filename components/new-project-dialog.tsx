"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useStore } from "@/lib/store"

export function NewProjectDialog({
  trigger,
  open: openProp,
  onOpenChange,
}: {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { addProject } = useStore()
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  async function submit() {
    if (!name.trim()) {
      toast.error("Give the project a name.")
      return
    }
    let project: Awaited<ReturnType<typeof addProject>>
    try {
      project = await addProject({
        name: name.trim(),
        description: description.trim(),
      })
    } catch (err) {
      toast.error("Couldn't create the project")
      console.error(err)
      return
    }
    toast.success(`Created ${project.name}`, {
      description: `Board key ${project.key} · widget token issued`,
      action: {
        label: "Set up widget",
        onClick: () => router.push(`/projects/${project.id}/settings`),
      },
    })
    setName("")
    setDescription("")
    setOpen(false)
    router.push(`/projects/${project.id}/settings`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger as React.ReactElement} />
      ) : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Each project gets its own board and a widget token you can embed on
            any number of sites.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="np-name">Name</FieldLabel>
            <Input
              id="np-name"
              placeholder="e.g. Tesuto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="np-desc">Description</FieldLabel>
            <Textarea
              id="np-desc"
              rows={2}
              placeholder="What this project covers"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Create project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
