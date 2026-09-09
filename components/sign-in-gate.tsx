"use client"

import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useStore } from "@/lib/store"

export function SignInGate({ children }: { children: React.ReactNode }) {
  const { authState } = useStore()

  if (authState === "loading") {
    return (
      <div className="flex h-svh w-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (authState === "anon") return <SignInScreen />

  return <>{children}</>
}

function SignInScreen() {
  const { signIn } = useStore()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setBusy(true)
    try {
      await signIn(name.trim(), email.trim())
    } catch (err) {
      toast.error("Couldn't sign in")
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-svh w-full items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Sign in to Tesuto</h1>
          <p className="text-sm text-muted-foreground">
            Your name and email identify the tickets and comments you file.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="signin-name">Name</Label>
          <Input
            id="signin-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada Lovelace"
            autoComplete="name"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="signin-email">Email</Label>
          <Input
            id="signin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </div>
        <Button type="submit" disabled={busy || !name.trim() || !email.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Continue"}
        </Button>
      </form>
    </div>
  )
}
