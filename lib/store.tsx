"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { create } from "zustand"
import { ApiError, api, setUnauthorizedHandler, stripNull } from "./api-client"
import {
  type Column,
  type Comment,
  columnMeta,
  type Doc,
  type IntegrationKey,
  type Integrations,
  type IssueType,
  type Project,
  type Sprint,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
  type User,
  type UserRole,
} from "./types"

export type NewTicketInput = {
  title: string
  description?: string
  projectId: string
  priority: TicketPriority
  type: IssueType
  assigneeId?: string
  parentId?: string
  sprintId?: string
  status?: string
  sourceUrl?: string
  screenshotUrl?: string
  recordingUrl?: string
  annotations?: Ticket["annotations"]
  domSnapshot?: Ticket["domSnapshot"]
  context?: Ticket["context"]
}

export type AuthState = "loading" | "authed" | "anon" | "error"
export type SyncState = "idle" | "syncing" | "error"

type Bootstrap = {
  users: User[]
  projects: Project[]
  columns: Column[]
  tickets: Ticket[]
  docs: Doc[]
  integrations: Integrations
  me: User
}

const NO_SPRINTS: Sprint[] = []

const DEFAULT_INTEGRATIONS: Integrations = {
  slack: { enabled: true, available: true },
  email: { enabled: true, available: true },
  githubSync: { enabled: true, available: true },
  githubProjects: { enabled: true, available: true },
  clickup: { enabled: true, available: true },
  hearthReleases: { enabled: true, available: true },
}

/** Client-side toggle name → server setting key. */
const SETTING_KEYS: Record<IntegrationKey, string> = {
  slack: "integration.slack",
  email: "integration.email",
  githubSync: "integration.github_sync",
  githubProjects: "integration.github_projects_import",
  clickup: "integration.clickup_import",
  hearthReleases: "integration.hearth_releases",
}

type StoreState = {
  authState: AuthState
  syncState: SyncState
  syncError: string | null
  requestSignInCode: (email: string) => Promise<void>
  verifySignInCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => void

  users: User[]
  projects: Project[]
  sprints: Sprint[]
  columns: Column[]
  tickets: Ticket[]
  comments: Comment[]
  loadedCommentTicketIds: string[]
  docs: Doc[]
  /** The signed-in user. Only read inside `<SignInGate>` (authState "authed"). */
  currentUser: User
  isAdmin: boolean
  githubConnected: boolean

  /** Integration toggles (Settings → Integrations, admin-editable). */
  integrations: Integrations
  updateIntegration: (key: IntegrationKey, enabled: boolean) => void

  getUser: (id?: string) => User | undefined
  getProject: (id?: string) => Project | undefined
  getSprint: (id?: string) => Sprint | undefined
  childrenOf: (ticketId: string) => Ticket[]
  getTicket: (id: string) => Ticket | undefined
  getDoc: (id: string) => Doc | undefined
  commentsFor: (ticketId: string) => Comment[]
  loadComments: (ticketId: string) => Promise<void>
  resolveProjectByToken: (token: string) => Project | undefined

  addProject: (input: { name: string; description: string }) => Promise<Project>
  deleteProject: (id: string) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  importProject: (input: {
    name: string
    description: string
    source: string
    issues: {
      title: string
      body?: string
      type: IssueType
      priority: TicketPriority
      resolved: boolean
    }[]
  }) => Promise<Project>
  importFromGithub: (input: {
    projectId: string
    name?: string
    description?: string
  }) => Promise<Project>
  importFromClickUp: (input: {
    token: string
    listId: string
    name: string
    description?: string
  }) => Promise<Project>

  addTicket: (input: NewTicketInput) => Promise<Ticket>
  updateTicket: (id: string, patch: Partial<Ticket>) => void
  moveTicket: (id: string, status: TicketStatus, order: number) => void
  setTicketSprint: (ticketId: string, sprintId?: string) => void
  addComment: (ticketId: string, body: string) => void
  syncToGithub: (ticketId: string) => Promise<Ticket>

  addColumn: (
    projectId: string,
    label: string,
    description?: string,
    dot?: string,
  ) => Promise<Column>
  updateColumn: (projectId: string, id: string, patch: Partial<Column>) => void
  removeColumn: (projectId: string, id: string, reassignTo: string) => void
  reorderColumns: (projectId: string, ids: string[]) => void
  deleteTickets: (ids: string[]) => void
  bulkMove: (ids: string[], status: string) => void

  addSprint: (input: Omit<Sprint, "id" | "createdAt">) => Sprint
  updateSprint: (id: string, patch: Partial<Sprint>) => void

  addDoc: (input: {
    title: string
    icon?: string
    projectId?: string
  }) => Promise<Doc>
  updateDoc: (id: string, patch: Partial<Doc>) => void
  deleteDoc: (id: string) => void

  addUser: (input: {
    name: string
    email: string
    role: UserRole
    title?: string
  }) => Promise<User>
  updateUser: (id: string, patch: Partial<User>) => void
  updateProfile: (patch: Partial<User>) => void
  connectGithub: () => void
  disconnectGithub: () => void

  /** @internal — boot/refresh, driven by <StoreEffects/> */
  _meId: string | null
  _lastLoad: number
  _load: () => Promise<void>
  _reset: () => void
}

let clientReady = false

export const useStore = create<StoreState>((set, get) => {
  /** Recompute the `currentUser` trio whenever users or the signed-in id move. */
  const withUsers = (users: User[]) => {
    const me = users.find((u) => u.id === get()._meId)
    return {
      users,
      currentUser: me as User,
      isAdmin: me?.role === "admin",
      githubConnected: me?.githubConnected ?? false,
    }
  }

  const upsertTicket = (next: Ticket) => {
    const t = stripNull(next)
    set((s) => ({
      tickets: s.tickets.some((x) => x.id === t.id)
        ? s.tickets.map((x) => (x.id === t.id ? t : x))
        : [t, ...s.tickets],
    }))
  }
  const upsertUser = (next: User) => {
    const u = stripNull(next)
    set((s) =>
      withUsers(
        s.users.some((x) => x.id === u.id)
          ? s.users.map((x) => (x.id === u.id ? u : x))
          : [...s.users, u],
      ),
    )
  }
  /** Folds a freshly imported project (+ its tickets) into the store. */
  const ingestImported = (created: Project & { tickets?: Ticket[] }) => {
    const { tickets: imported, ...project } = created
    set((s) => ({
      projects: [...s.projects, project],
      tickets: [...(imported ?? []), ...s.tickets],
    }))
    return project
  }
  const isTerminal = (status: string) =>
    columnMeta(status, get().columns).terminal
  const refetchColumns = async () =>
    set({ columns: stripNull(await api.get<Column[]>("/columns")) })

  return {
    authState: "loading",
    syncState: "idle",
    syncError: null,
    users: [],
    projects: [],
    sprints: NO_SPRINTS,
    columns: [],
    tickets: [],
    comments: [],
    loadedCommentTicketIds: [],
    docs: [],
    currentUser: undefined as unknown as User,
    isAdmin: false,
    githubConnected: false,
    integrations: DEFAULT_INTEGRATIONS,
    _meId: null,
    _lastLoad: 0,

    _load: async () => {
      set({ _lastLoad: Date.now(), syncState: "syncing", syncError: null })
      let b: Bootstrap
      try {
        b = stripNull(await api.get<Bootstrap>("/bootstrap"))
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) {
          set((state) => ({
            syncState: "error",
            syncError:
              error instanceof Error ? error.message : "Couldn't load Tesuto",
            authState:
              state.authState === "loading" ? "error" : state.authState,
          }))
        }
        throw error
      }
      // One atomic set(): authState flips to "authed" in the same update as
      // currentUser. Splitting this into two set() calls (as before) let
      // subscribers — e.g. <SignInGate> — observe authState: "authed" with
      // currentUser still undefined for one render, crashing anything that
      // reads currentUser.id without optional chaining.
      const me = b.users.find((u) => u.id === b.me.id)
      set(() => ({
        _meId: b.me.id,
        projects: b.projects,
        columns: b.columns,
        tickets: b.tickets,
        docs: b.docs,
        integrations: b.integrations ?? DEFAULT_INTEGRATIONS,
        authState: "authed" as const,
        syncState: "idle" as const,
        syncError: null,
        users: b.users,
        currentUser: me as User,
        isAdmin: me?.role === "admin",
        githubConnected: me?.githubConnected ?? false,
      }))
    },
    _reset: () =>
      set({
        users: [],
        projects: [],
        columns: [],
        tickets: [],
        comments: [],
        loadedCommentTicketIds: [],
        docs: [],
        _meId: null,
        currentUser: undefined as unknown as User,
        isAdmin: false,
        githubConnected: false,
        integrations: DEFAULT_INTEGRATIONS,
        authState: "anon",
        syncState: "idle",
        syncError: null,
      }),

    refresh: () => {
      if (get().syncState === "syncing") return
      void get()
        ._load()
        .catch(() => {})
    },

    requestSignInCode: async (email) => {
      await api.post("/auth/sign-in", { email })
    },
    verifySignInCode: async (email, code) => {
      const { user } = await api.post<{ user: User }>("/auth/verify", {
        email,
        code,
      })
      set({ _meId: user.id })
      await get()._load()
    },
    signOut: async () => {
      try {
        await api.post("/auth/sign-out")
      } catch {}
      get()._reset()
    },

    getUser: (id) => get().users.find((u) => u.id === id),
    getProject: (id) => get().projects.find((p) => p.id === id),
    getSprint: () => undefined,
    getTicket: (id) => get().tickets.find((t) => t.id === id),
    getDoc: (id) => get().docs.find((d) => d.id === id),
    childrenOf: (ticketId) =>
      get()
        .tickets.filter((t) => t.parentId === ticketId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    commentsFor: (ticketId) =>
      get()
        .comments.filter((c) => c.ticketId === ticketId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    loadComments: async (ticketId) => {
      if (get().loadedCommentTicketIds.includes(ticketId)) return
      const rows = stripNull(
        await api.get<Comment[]>(`/tickets/${ticketId}/comments`),
      )
      set((state) => ({
        comments: [
          ...state.comments.filter((comment) => comment.ticketId !== ticketId),
          ...rows,
        ],
        loadedCommentTicketIds: [
          ...state.loadedCommentTicketIds.filter((id) => id !== ticketId),
          ticketId,
        ],
      }))
    },
    resolveProjectByToken: (token) =>
      get().projects.find((p) => p.token === token.trim()),

    addProject: async (input) => {
      const created = stripNull(await api.post<Project>("/projects", input))
      set((s) => ({ projects: [...s.projects, created] }))
      return created
    },
    importProject: async (input) => {
      const created = stripNull(
        await api.post<Project & { tickets: Ticket[] }>(
          "/projects/import",
          input,
        ),
      )
      return ingestImported(created)
    },
    importFromGithub: async (input) => {
      const created = stripNull(
        await api.post<Project & { tickets: Ticket[] }>(
          "/import/github",
          input,
        ),
      )
      return ingestImported(created)
    },
    importFromClickUp: async (input) => {
      const created = stripNull(
        await api.post<Project & { tickets: Ticket[] }>(
          "/import/clickup",
          input,
        ),
      )
      return ingestImported(created)
    },
    deleteProject: (id) => {
      const previous = {
        projects: get().projects,
        tickets: get().tickets,
        docs: get().docs,
      }
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        tickets: s.tickets.filter((t) => t.projectId !== id),
        docs: s.docs.map((d) =>
          d.projectId === id ? { ...d, projectId: undefined } : d,
        ),
      }))
      api.del(`/projects/${id}`).catch((e) => {
        set(previous)
        toast.error("Couldn't delete the project")
        console.error(e)
      })
    },
    updateProject: (id, patch) => {
      const previous = get().projects.find((project) => project.id === id)
      const body: Record<string, unknown> = {}
      for (const key of ["name", "description", "githubRepo"] as const) {
        if (key in patch) body[key] = patch[key] ?? null
      }
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === id ? stripNull({ ...p, ...patch }) : p,
        ),
      }))
      api
        .patch<Project>(`/projects/${id}`, body)
        .then((updated) =>
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === id ? stripNull(updated) : p,
            ),
          })),
        )
        .catch((e) => {
          if (previous) {
            set((s) => ({
              projects: s.projects.map((project) =>
                project.id === id ? previous : project,
              ),
            }))
          }
          toast.error(
            e instanceof Error ? e.message : "Project settings didn't save",
          )
          console.error(e)
        })
    },

    addTicket: async (input) => {
      const created = stripNull(await api.post<Ticket>("/tickets", input))
      set((s) => ({ tickets: [created, ...s.tickets] }))
      return created
    },
    updateTicket: (id, patch) => {
      const previous = get().tickets.find((ticket) => ticket.id === id)
      const body: Record<string, unknown> = {}
      for (const key of [
        "title",
        "description",
        "status",
        "priority",
        "type",
        "assigneeId",
        "parentId",
        "order",
        "githubIssueUrl",
        "annotations",
      ] as const) {
        if (key in patch) body[key] = patch[key] ?? null
      }
      set((s) => ({
        tickets: s.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }))
      api
        .patch<Ticket>(`/tickets/${id}`, body)
        .then(upsertTicket)
        .catch((e) => {
          if (previous) upsertTicket(previous)
          toast.error("Change didn't save")
          console.error(e)
        })
    },
    moveTicket: (id, status, order) => {
      const previous = get().tickets.find((ticket) => ticket.id === id)
      const iso = new Date().toISOString()
      const actorId = get().currentUser?.id
      const terminal = isTerminal(status)
      set((s) => ({
        tickets: s.tickets.map((t) => {
          if (t.id !== id) return t
          const events = [...(t.events ?? [])]
          if (status !== t.status) {
            events.push({
              at: iso,
              kind: "status",
              actorId,
              from: t.status,
              to: status,
            })
          }
          return {
            ...t,
            status,
            order,
            resolvedAt: terminal ? (t.resolvedAt ?? iso) : undefined,
            events,
            updatedAt: iso,
          }
        }),
      }))
      api
        .patch<Ticket>(`/tickets/${id}`, { status, order })
        .then(upsertTicket)
        .catch((e) => {
          if (previous) upsertTicket(previous)
          toast.error("Couldn't move that ticket")
          console.error(e)
        })
    },
    setTicketSprint: () => {},
    addComment: (ticketId, body) => {
      api
        .post<Comment>(`/tickets/${ticketId}/comments`, { body })
        .then((c) =>
          set((s) => ({
            comments: [...s.comments, stripNull(c)],
            tickets: s.tickets.map((ticket) =>
              ticket.id === ticketId
                ? { ...ticket, commentCount: (ticket.commentCount ?? 0) + 1 }
                : ticket,
            ),
          })),
        )
        .catch((e) => {
          toast.error("Comment didn't post")
          console.error(e)
        })
    },
    syncToGithub: (ticketId) => {
      return api
        .post<Ticket>(`/tickets/${ticketId}/sync-github`)
        .then((t) => {
          upsertTicket(t)
          return t
        })
        .catch((e) => {
          toast.error(e instanceof Error ? e.message : "GitHub sync failed")
          console.error(e)
          throw e
        })
    },

    addColumn: async (projectId, label, description, dot) => {
      const created = stripNull(
        await api.post<Column>("/columns", {
          projectId,
          label,
          description,
          dot,
        }),
      )
      await refetchColumns()
      return created
    },
    updateColumn: (projectId, id, patch) => {
      const previous = get().columns.find(
        (column) => column.id === id && column.projectId === projectId,
      )
      set((s) => ({
        columns: s.columns.map((c) =>
          c.id === id && c.projectId === projectId ? { ...c, ...patch } : c,
        ),
      }))
      api
        .patch<Column>(`/columns/${id}`, { projectId, ...patch })
        .catch((e) => {
          if (previous) {
            set((s) => ({
              columns: s.columns.map((column) =>
                column.id === id && column.projectId === projectId
                  ? previous
                  : column,
              ),
            }))
          }
          toast.error("Column change didn't save")
          console.error(e)
        })
    },
    removeColumn: (projectId, id, reassignTo) => {
      const previous = { columns: get().columns, tickets: get().tickets }
      set((s) => ({
        columns: s.columns.filter(
          (c) => !(c.id === id && c.projectId === projectId),
        ),
        tickets: s.tickets.map((t) =>
          t.projectId === projectId && t.status === id
            ? { ...t, status: reassignTo }
            : t,
        ),
      }))
      api
        .del(
          `/columns/${id}?projectId=${encodeURIComponent(projectId)}&reassignTo=${encodeURIComponent(reassignTo)}`,
        )
        .catch((e) => {
          set(previous)
          toast.error("Couldn't delete the column")
          console.error(e)
        })
    },
    reorderColumns: (projectId, ids) => {
      const previous = get().columns
      set((s) => {
        const byId = new Map(
          s.columns
            .filter((c) => c.projectId === projectId)
            .map((c) => [c.id, c]),
        )
        const reordered = ids
          .map((i) => byId.get(i))
          .filter((c): c is Column => Boolean(c))
        return {
          columns: [
            ...s.columns.filter((c) => c.projectId !== projectId),
            ...reordered,
          ],
        }
      })
      api.post("/columns/reorder", { projectId, ids }).catch((e) => {
        set({ columns: previous })
        toast.error("Couldn't reorder columns")
        console.error(e)
      })
    },
    deleteTickets: (ids) => {
      const previous = get().tickets
      const drop = new Set(ids)
      set((s) => ({ tickets: s.tickets.filter((t) => !drop.has(t.id)) }))
      api.post("/tickets/bulk", { action: "delete", ids }).catch((e) => {
        set({ tickets: previous })
        toast.error("Couldn't delete tickets")
        console.error(e)
      })
    },
    bulkMove: (ids, status) => {
      const previous = get().tickets
      const hit = new Set(ids)
      const iso = new Date().toISOString()
      const terminal = isTerminal(status)
      const actorId = get().currentUser?.id
      set((s) => ({
        tickets: s.tickets.map((t) =>
          hit.has(t.id)
            ? {
                ...t,
                status,
                resolvedAt: terminal ? (t.resolvedAt ?? iso) : undefined,
                events: [
                  ...(t.events ?? []),
                  {
                    at: iso,
                    kind: "status" as const,
                    actorId,
                    from: t.status,
                    to: status,
                  },
                ],
                updatedAt: iso,
              }
            : t,
        ),
      }))
      api.post("/tickets/bulk", { action: "move", ids, status }).catch((e) => {
        set({ tickets: previous })
        toast.error("Couldn't move tickets")
        console.error(e)
      })
    },

    addSprint: (input) => ({
      ...input,
      id: `s_${Date.now()}`,
      createdAt: new Date().toISOString(),
    }),
    updateSprint: () => {},

    addDoc: async (input) => {
      const created = stripNull(await api.post<Doc>("/docs", input))
      set((s) => ({ docs: [created, ...s.docs] }))
      return created
    },
    updateDoc: (id, patch) => {
      const previous = get().docs.find((doc) => doc.id === id)
      set((s) => ({
        docs: s.docs.map((d) =>
          d.id === id
            ? { ...d, ...patch, updatedAt: new Date().toISOString() }
            : d,
        ),
      }))
      api.patch<Doc>(`/docs/${id}`, patch).catch((e) => {
        if (previous) {
          set((s) => ({
            docs: s.docs.map((doc) => (doc.id === id ? previous : doc)),
          }))
        }
        toast.error("Doc didn't save")
        console.error(e)
      })
    },
    deleteDoc: (id) => {
      const previous = get().docs
      set((s) => ({ docs: s.docs.filter((d) => d.id !== id) }))
      api.del(`/docs/${id}`).catch((e) => {
        set({ docs: previous })
        toast.error("Couldn't delete the doc")
        console.error(e)
      })
    },

    addUser: async (input) => {
      const created = stripNull(await api.post<User>("/users", input))
      set((s) => withUsers([...s.users, created]))
      return created
    },
    updateUser: (id, patch) => {
      const previous = get().users.find((user) => user.id === id)
      set((s) =>
        withUsers(s.users.map((u) => (u.id === id ? { ...u, ...patch } : u))),
      )
      api
        .patch<User>(`/users/${id}`, patch)
        .then(upsertUser)
        .catch((e) => {
          if (previous) upsertUser(previous)
          toast.error("Couldn't update the user")
          console.error(e)
        })
    },
    updateProfile: (patch) => {
      const meId = get()._meId
      if (!meId) return
      const previous = get().users.find((user) => user.id === meId)
      set((s) =>
        withUsers(s.users.map((u) => (u.id === meId ? { ...u, ...patch } : u))),
      )
      api
        .patch<User>("/me", patch)
        .then(upsertUser)
        .catch((e) => {
          if (previous) upsertUser(previous)
          toast.error("Profile didn't save")
          console.error(e)
        })
    },
    /** Starts the GitHub OAuth flow; the server mints a signed state and the
     * browser leaves for github.com. Completion lands on /settings with a
     * `?github=` result the settings page toasts. */
    updateIntegration: (key, enabled) => {
      const previous = get().integrations[key]
      set((s) => ({
        integrations: {
          ...s.integrations,
          [key]: { ...s.integrations[key], enabled },
        },
      }))
      api
        .patch(`/settings/integrations`, {
          key: SETTING_KEYS[key],
          enabled,
        })
        .catch((e) => {
          set((s) => ({
            integrations: { ...s.integrations, [key]: previous },
          }))
          toast.error("Couldn't update that integration")
          console.error(e)
        })
    },
    connectGithub: () => {
      api
        .get<{ url: string }>("/github/connect")
        .then(({ url }) => {
          window.location.href = url
        })
        .catch((e) => {
          toast.error(
            e instanceof Error ? e.message : "Couldn't start GitHub sign-in",
          )
          console.error(e)
        })
    },
    disconnectGithub: () => {
      api.del<User>("/me/github").then(upsertUser).catch(console.error)
    },
  }
})

/**
 * Drives boot + refresh for the Zustand store. Rendered once near the root
 * (see `components/providers.tsx`).
 */
export function StoreEffects() {
  useEffect(() => {
    if (clientReady) return
    clientReady = true

    setUnauthorizedHandler(() => useStore.getState()._reset())
    try {
      window.localStorage.removeItem("tesuto:v3")
    } catch {}

    useStore
      .getState()
      ._load()
      .catch(() => {})

    // Keep the board fresh so issues filed elsewhere (the embedded widget on
    // another origin, a teammate) show up without a manual reload.
    const pull = (minAge: number) => {
      const s = useStore.getState()
      if (
        document.visibilityState === "visible" &&
        s.authState === "authed" &&
        Date.now() - s._lastLoad > minAge
      ) {
        void s._load().catch(() => {})
      }
    }
    const onFocus = () => pull(3_000)
    const poll = setInterval(() => pull(12_000), 12_000)
    document.addEventListener("visibilitychange", onFocus)
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(poll)
      document.removeEventListener("visibilitychange", onFocus)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  return null
}
