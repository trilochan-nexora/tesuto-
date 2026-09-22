"use client"

import { AlertCircle, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useStore } from "@/lib/store"

export function SignInGate({ children }: { children: React.ReactNode }) {
  const { authState, refresh, syncState, syncError } = useStore()

  if (authState === "loading") {
    return (
      <div className="flex h-svh w-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (authState === "error") {
    return (
      <div className="flex h-svh w-full items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <AlertCircle className="size-6 text-destructive" />
          <div>
            <h1 className="font-semibold">Tesuto couldn't load</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {syncError ?? "Check your connection and try again."}
            </p>
          </div>
          <Button onClick={refresh} disabled={syncState === "syncing"}>
            {syncState === "syncing" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (authState === "anon") return <SignInScreen />

  return <>{children}</>
}

function SignInScreen() {
  const { requestSignInCode, verifySignInCode } = useStore()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || (step === "code" && !/^\d{6}$/.test(code))) return
    setBusy(true)
    try {
      if (step === "email") {
        await requestSignInCode(email.trim())
        setStep("code")
        toast.success("If that account is active, a sign-in code was sent")
      } else {
        await verifySignInCode(email.trim(), code)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't sign in")
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
            {step === "email"
              ? "Use the email address on your Tesuto account."
              : `Enter the 6-digit code sent to ${email.trim()}.`}
          </p>
        </div>
        {step === "email" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="signin-email">Email</Label>
            <Input
              id="signin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="signin-code">Sign-in code</Label>
            <Input
              id="signin-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
            />
          </div>
        )}
        <div className="flex gap-2">
          {step === "code" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStep("email")
                setCode("")
              }}
              disabled={busy}
            >
              Back
            </Button>
          ) : null}
          <Button
            type="submit"
            className="flex-1"
            disabled={
              busy ||
              !email.trim() ||
              (step === "code" && !/^\d{6}$/.test(code))
            }
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : step === "email" ? (
              "Email me a code"
            ) : (
              "Verify and sign in"
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
