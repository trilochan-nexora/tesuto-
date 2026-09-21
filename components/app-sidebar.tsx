"use client"

import {
  ChartLine,
  Flame,
  Inbox,
  LayoutGrid,
  LogOut,
  NotebookPen,
  Plug,
  Plus,
  Rocket,
  Settings,
  Shield,
  Users,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NewTicketDialog } from "@/components/new-ticket-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useStore } from "@/lib/store"
import { cn, initials } from "@/lib/utils"

const mainNav = [
  { title: "Inbox", href: "/inbox", icon: Inbox },
  { title: "Projects", href: "/projects", icon: LayoutGrid },
  { title: "Analytics", href: "/analytics", icon: ChartLine },
  { title: "Sprints", href: "/sprints", icon: NotebookPen },
]

const toolsNav = [
  { title: "Widget", href: "/widget", icon: Plug },
  { title: "Releases", href: "/releases", icon: Rocket },
  { title: "Users", href: "/team", icon: Shield },
  { title: "Settings", href: "/settings", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { projects, currentUser, isAdmin, signOut } = useStore()

  const isActive = (href: string) =>
    href === "/inbox" ? pathname === href : pathname.startsWith(href)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-2">
        <Link href="/inbox" className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Flame className="size-4.5" />
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
                  <Plus />
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
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
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
                    <item.icon />
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
            <SidebarMenuButton
              className="h-auto py-2"
              render={<Link href="/profile" />}
              isActive={isActive("/profile")}
              tooltip={currentUser.name}
            >
              <Avatar className="size-7">
                <AvatarFallback
                  className={cn("text-xs font-medium text-white")}
                  style={{ backgroundColor: currentUser.color }}
                >
                  {initials(currentUser.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{currentUser.name}</span>
                  {isAdmin ? (
                    <Users className="size-3 shrink-0 text-muted-foreground" />
                  ) : null}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentUser.email}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={() => {
                void signOut()
              }}
            >
              <LogOut />
              <span className="group-data-[collapsible=icon]:hidden">
                Sign out
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
