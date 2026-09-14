"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ChevronsUpDown, House, LogOut, PanelLeftClose, Plus, SlidersHorizontal } from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getRecentSessions, type SavedSession } from "@/lib/sessions";
import { useClientReady } from "@/lib/client-ready";
import { cn } from "@/lib/utils";
import { ChalkMark } from "./ChalkMark";

// Black rail. The mark opens the sidebar when it is collapsed and goes home
// when it is open; the collapse control lives in the header, not in the page.

function initials(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const ITEM = "text-white/70 hover:text-white active:text-white data-active:text-white";

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useClientReady();
  const { state, toggleSidebar } = useSidebar();
  const { data: auth } = useSession();
  const [sessions, setSessions] = useState<SavedSession[] | null>(null);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    getRecentSessions(8).then((list) => {
      if (!cancelled) setSessions(list);
    });
    return () => {
      cancelled = true;
    };
  }, [mounted, pathname]);

  const collapsed = state === "collapsed";
  const name = auth?.user?.name ?? null;
  const email = auth?.user?.email ?? null;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-[56px] flex-row items-center justify-between px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => (collapsed ? toggleSidebar() : router.push("/"))}
                aria-label={collapsed ? "Open sidebar" : "Home"}
                className="flex h-9 items-center gap-2 rounded-md px-1.5 text-white outline-none transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              />
            }
          >
            <ChalkMark size={collapsed ? 26 : 24} />
            {!collapsed && <span className="lp-display text-[16.5px] tracking-[-0.02em]">chalk</span>}
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">Open sidebar</TooltipContent>}
        </Tooltip>
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label="Collapse sidebar"
                  className="flex size-8 items-center justify-center rounded-md text-white/45 outline-none transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                />
              }
            >
              <PanelLeftClose className="size-[17px]" strokeWidth={1.8} />
            </TooltipTrigger>
            <TooltipContent side="right">Collapse</TooltipContent>
          </Tooltip>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="New session"
                  onClick={() => router.push("/session")}
                  className="bg-white font-medium text-(--lp-ink) hover:bg-white/90 hover:text-(--lp-ink) active:bg-white/85 active:text-(--lp-ink)"
                >
                  <Plus strokeWidth={2.4} />
                  <span>New session</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="text-white/40">Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sessions === null
                ? [72, 56, 64].map((w) => (
                    <SidebarMenuItem key={w}>
                      <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
                        <Skeleton className="size-4 rounded-md bg-white/10" />
                        <Skeleton className="h-3.5 rounded-md bg-white/10" style={{ width: `${w}%` }} />
                      </div>
                    </SidebarMenuItem>
                  ))
                : sessions.length === 0
                  ? (
                    <li className="px-2 py-1.5 text-[12.5px] text-white/40 group-data-[collapsible=icon]:hidden">
                      Sessions you start will show up here.
                    </li>
                  )
                  : sessions.map((s) => {
                    const active = pathname === `/session/${s.id}`;
                    return (
                      <SidebarMenuItem key={s.id}>
                        <SidebarMenuButton
                          tooltip={s.title}
                          isActive={active}
                          onClick={() => router.push(`/session/${s.id}`)}
                          className={cn(ITEM, "pl-2.5")}
                        >
                          <span>{s.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-0.5 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Home" isActive={pathname === "/"} onClick={() => router.push("/")} className={ITEM}>
              <House strokeWidth={1.8} />
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" isActive={pathname === "/settings"} onClick={() => router.push("/settings")} className={ITEM}>
              <SlidersHorizontal strokeWidth={1.8} />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg" tooltip={name ?? "Account"} className={cn("mt-1", ITEM, "text-white data-open:bg-sidebar-accent")} />
                }
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/12 text-[11.5px] font-semibold text-white">
                  {initials(name, email)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium">{name ?? "Your account"}</span>
                  <span className="truncate text-[11.5px] text-white/45">{email ?? ""}</span>
                </span>
                <ChevronsUpDown className="ml-auto size-4 text-white/45" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[12px] text-(--lp-ink-3)">{email ?? "Signed in"}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  <SlidersHorizontal />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail className="after:bg-white/10 hover:after:bg-white/25" />
    </Sidebar>
  );
}
