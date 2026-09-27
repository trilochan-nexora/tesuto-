import { AppSidebar } from "@/components/app-sidebar"
import { SignInGate } from "@/components/sign-in-gate"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SignInGate>
      {/* Shell is locked to the viewport; only <main> scrolls, so the sticky
          AppHeader (and the sidebar) stay put instead of the whole page moving. */}
      <SidebarProvider className="h-svh overflow-hidden">
        <AppSidebar />
        <SidebarInset className="h-svh min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain">
          {children}
        </SidebarInset>
      </SidebarProvider>
    </SignInGate>
  )
}
