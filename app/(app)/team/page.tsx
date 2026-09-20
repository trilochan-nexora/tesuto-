"use client"

import { ShieldAlert, UserPlus } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"
import { AppHeader } from "@/components/app-header"
import { InviteUserDialog } from "@/components/invite-user-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
import { initials } from "@/lib/utils"

export default function TeamPage() {
  const { users, tickets, currentUser, isAdmin, updateUser } = useStore()

  const load = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of tickets) {
      if (t.assigneeId && !t.resolvedAt) {
        map[t.assigneeId] = (map[t.assigneeId] ?? 0) + 1
      }
    }
    return map
  }, [tickets])

  const activeAdmins = users.filter((u) => u.role === "admin" && u.active)
  const admins = activeAdmins.length

  if (!isAdmin) {
    const others = activeAdmins
      .filter((u) => u.id !== currentUser.id)
      .map((u) => u.name)
    const ask =
      others.length === 0
        ? "an admin"
        : others.length === 1
          ? others[0]
          : `${others.slice(0, -1).join(", ")} or ${others[others.length - 1]}`
    return (
      <>
        <AppHeader title="Users" description="Team & access management" />
        <Empty className="py-24">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert />
            </EmptyMedia>
            <EmptyTitle>Admins only</EmptyTitle>
            <EmptyDescription>
              User management is restricted to admins. Ask {ask} for access.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    )
  }

  return (
    <>
      <AppHeader
        title="Users"
        description={`${users.filter((u) => u.active).length} active · ${admins} admins`}
      />

      <div className="flex w-full flex-col gap-6 p-4 md:p-8">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Team &amp; access</p>
          <InviteUserDialog
            trigger={
              <Button size="sm">
                <UserPlus data-icon="inline-start" />
                Invite someone
              </Button>
            }
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Person</th>
                <th className="pb-2 text-right font-medium">Open load</th>
                <th className="pb-2 pl-4 font-medium">Role</th>
                <th className="pb-2 pl-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const lastAdmin = u.role === "admin" && admins === 1
                return (
                  <tr key={u.id} className="border-b last:border-b-0">
                    <td className="py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span
                          className={`flex size-7 items-center justify-center rounded-full text-[11px] font-medium text-white ${u.active ? "" : "opacity-40"}`}
                          style={{ backgroundColor: u.color }}
                        >
                          {initials(u.name)}
                        </span>
                        <span className="flex flex-col leading-tight">
                          <span
                            className={
                              u.active
                                ? ""
                                : "text-muted-foreground line-through"
                            }
                          >
                            {u.name}
                            {u.id === currentUser.id ? (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                (you)
                              </span>
                            ) : null}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {u.title ? `${u.title} · ` : ""}
                            {u.email}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {load[u.id] ?? 0}
                    </td>
                    <td className="py-2.5 pl-4">
                      <Select
                        value={u.role}
                        disabled={u.id === currentUser.id}
                        onValueChange={(v) => {
                          if (!v) return
                          if (u.id === currentUser.id) return
                          if (lastAdmin && v !== "admin") {
                            toast.error("Keep at least one admin.")
                            return
                          }
                          updateUser(u.id, { role: v as UserRole })
                        }}
                      >
                        <SelectTrigger className="h-7 w-28 text-xs" size="sm">
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
                    </td>
                    <td className="py-2.5 pl-4">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          if (u.active && lastAdmin) {
                            toast.error("Keep at least one active admin.")
                            return
                          }
                          if (u.active && u.id === currentUser.id) {
                            toast.error("You can't deactivate yourself.")
                            return
                          }
                          updateUser(u.id, { active: !u.active })
                        }}
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
