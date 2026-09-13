"use client";

import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./AppSidebar";

// One flat surface: the sidebar sits edge to edge with a hairline, the page
// fills the rest. No panels floating on a gray backdrop.
export function AppShell({
  children,
  defaultOpen = true,
  className,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh min-h-0">
      <AppSidebar />
      <SidebarInset className={cn("h-svh min-h-0 min-w-0 overflow-hidden bg-white", className)}>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
