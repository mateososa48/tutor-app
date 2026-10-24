"use client";

import type { CSSProperties, ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";

// The window (Paper "Sidebar", version A): the rail's black fills it, and the
// page is a white sheet inset 6px with 16px corners. On a phone the rail is a
// sheet of its own and the page fills the screen.
//
// `bar` gives the page the shared top bar (search and the account menu);
// the session screen and the pages that bring their own header turn it off.
export function AppShell({
  children,
  defaultOpen = true,
  bar = false,
  actions,
  className,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  bar?: boolean;
  /** Extra controls for the shared top bar, left of the account menu (a save status). */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      className="h-svh min-h-0 bg-sidebar"
      style={{ "--sidebar-width": "228px", "--sidebar-width-icon": "64px" } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset
        className={cn(
          "h-svh min-h-0 min-w-0 overflow-hidden bg-white",
          "md:my-1.5 md:mr-1.5 md:h-[calc(100svh-12px)] md:rounded-[16px]",
          className,
        )}
      >
        {bar && <AppTopBar actions={actions} />}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
