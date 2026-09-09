import { AppSidebar } from "@/components/app-sidebar"
import { SignInGate } from "@/components/sign-in-gate"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SignInGate>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0 max-w-full overflow-x-hidden">
          {children}
        </SidebarInset>
      </SidebarProvider>
    </SignInGate>
  )
}
