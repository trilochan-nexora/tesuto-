"use client"

import { ChartLineIcon, TrayIcon, SquaresFourIcon, SignOutIcon, NotePencilIcon, PlugIcon, PlusIcon, RocketIcon, ShieldIcon, UserIcon, UsersIcon, DotsThreeVerticalIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { TesutoMark } from "@/components/icons"
import { NewTicketDialog } from "@/components/new-ticket-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useStore } from "@/lib/store"
import { ROLE_META } from "@/lib/types"
import { initials } from "@/lib/utils"

const mainNav = [
  { title: "Inbox", href: "/inbox", icon: TrayIcon, color: "text-blue-500" },
  {
    title: "Projects",
    href: "/projects",
    icon: SquaresFourIcon,
    color: "text-violet-500",
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: ChartLineIcon,
    color: "text-emerald-500",
  },
  {
    title: "Sprints",
    href: "/sprints",
    icon: NotePencilIcon,
    color: "text-rose-500",
  },
]

const toolsNav = [
  { title: "Widget", href: "/widget", icon: PlugIcon, color: "text-cyan-500" },
  {
    title: "Releases",
    href: "/releases",
    icon: RocketIcon,
    color: "text-indigo-500",
  },
  { title: "Users", href: "/team", icon: ShieldIcon, color: "text-teal-500" },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { projects, tickets, currentUser, isAdmin, signOut } = useStore()
  const openCount = tickets.filter((t) => !t.resolvedAt).length

  const isActive = (href: string) =>
    href === "/inbox" ? pathname === href : pathname.startsWith(href)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-2">
        <Link href="/inbox" className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <TesutoMark className="size-4.5" />
          </div>
          <div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">Tesuto</span>
            <span className="text-xs text-muted-foreground">Bug tracker</span>
          </div>
        </Link>
        <SidebarMenu>
          <SidebarMenuItem>
            <NewTicketDialog
              trigger={
                <SidebarMenuButton
                  title={
                    projects.length === 0
                      ? "Create a project first"
                      : "New ticket"
                  }
                  disabled={projects.length === 0}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary active:text-primary-foreground"
                >
                  <PlusIcon />
                  <span>New ticket</span>
                </SidebarMenuButton>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                  >
                    <item.icon className={item.color} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {item.href === "/inbox" && openCount > 0 ? (
                    <SidebarMenuBadge className="bg-destructive text-white">
                      {openCount > 99 ? "99+" : openCount}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    render={<Link href={`/projects/${project.id}`} />}
                    isActive={pathname === `/projects/${project.id}`}
                    tooltip={project.name}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-[4px]"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="truncate">{project.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolsNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                  >
                    <item.icon className={item.color} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    className="h-auto py-2"
                    tooltip={currentUser.name}
                  >
                    <Avatar className="size-7">
                      <AvatarFallback
                        className="text-xs font-medium text-white"
                        style={{ backgroundColor: currentUser.color }}
                      >
                        {initials(currentUser.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{currentUser.name}</span>
                        {isAdmin ? (
                          <UsersIcon className="size-3 shrink-0 text-muted-foreground" />
                        ) : null}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {ROLE_META[currentUser.role].label}
                      </span>
                    </div>
                    <DotsThreeVerticalIcon className="ml-auto size-4 shrink-0 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-64"
              >
                <div className="flex items-center gap-3 px-1.5 py-1.5">
                  <Avatar className="size-9">
                    <AvatarFallback
                      className="text-sm font-medium text-white"
                      style={{ backgroundColor: currentUser.color }}
                    >
                      {initials(currentUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {currentUser.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {ROLE_META[currentUser.role].label}
                    </span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/settings" />}>
                  <UserIcon className="size-4" />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void signOut()
                  }}
                >
                  <SignOutIcon className="size-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
