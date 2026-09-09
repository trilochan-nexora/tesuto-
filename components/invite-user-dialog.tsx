"use client"

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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStore } from "@/lib/store"
import { ROLE_META, type UserRole } from "@/lib/types"

export function InviteUserDialog({ trigger }: { trigger: React.ReactNode }) {
  const { users, addUser } = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [title, setTitle] = useState("")
  const [role, setRole] = useState<UserRole>("member")

  async function submit() {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required.")
      return
    }
    if (
      users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    ) {
      toast.error("That email is already on the team.")
      return
    }
    let user: Awaited<ReturnType<typeof addUser>>
    try {
      user = await addUser({
        name: name.trim(),
        email: email.trim(),
        role,
        title: title.trim(),
      })
    } catch (err) {
      toast.error("Couldn't add the user")
      console.error(err)
      return
    }
    toast.success(`Added ${user.name}`, { description: ROLE_META[role].label })
    setName("")
    setEmail("")
    setTitle("")
    setRole("member")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>
            They&apos;ll be able to sign in with the shared company session.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="iv-name">Full name</FieldLabel>
            <Input
              id="iv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="iv-email">Email</FieldLabel>
            <Input
              id="iv-email"
              type="email"
              placeholder="email@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="iv-title">Title</FieldLabel>
              <Input
                id="iv-title"
                placeholder="Optional"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <Select
                value={role}
                onValueChange={(v) => v && setRole(v as UserRole)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => ROLE_META[v as UserRole].label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <FieldDescription>{ROLE_META[role].description}</FieldDescription>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Add to team</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
