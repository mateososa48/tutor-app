"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { isAdminEmail } from "@/lib/admin-emails";
import { ChevronsUpDown, House, LogOut, PanelLeft, Plus, SlidersHorizontal, ShieldCheck } from "lucide-react";
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

// Plain black rail in the pressed-button vocabulary (`.sb-btn`, `.sb-item` in
// globals.css), near-black with off-white text: no outlines, no fills, no lifts. New session is a normal row,
// a little brighter and bolder than the rest; the current page shows a sky
// icon, or a sky dot before a session's title. The mark
// always goes home. The sidebar toggle (a plain panel glyph, full white) sits
// at the header's right edge while the sidebar is open and beneath the mark
// while it is collapsed; the two fade past each other as the width animates.

function initials(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const STROKE = 2.5; // every glyph in the rail
const TOGGLE_STROKE = 2.1; // the panel toggle is a touch lighter and smaller than the rest
const ITEM = "sb-item";
const TRIGGER = "sb-item sb-toggle absolute flex size-8 items-center justify-center rounded-md outline-none";
const EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]";

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useClientReady();
  const { state, isMobile, toggleSidebar } = useSidebar();
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

  // On phones the sidebar is a sheet that always shows the open layout.
  const collapsed = !isMobile && state === "collapsed";
  const name = auth?.user?.name ?? null;
  const email = auth?.user?.email ?? null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader
        className={cn(
          "relative h-14 shrink-0 overflow-hidden p-0 transition-[height] duration-300 group-data-[collapsible=icon]:h-[92px]",
          EASE,
        )}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => router.push("/")}
                aria-label="Home"
                className="sb-item absolute top-2.5 left-2 flex h-9 items-center gap-2 rounded-md px-2 outline-none"
              />
            }
          >
            <ChalkMark
              size={29}
              className="transition-[translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[collapsible=icon]:-translate-x-[6.5px] motion-reduce:transition-none"
            />
            {!collapsed && <span className="lp-brand animate-in fade-in text-[20px] text-sidebar-foreground duration-300">chalk</span>}
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">Home</TooltipContent>}
        </Tooltip>

        {/* Collapse: the header's right edge, only while open. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                inert={collapsed}
                className={cn(TRIGGER, "top-3 right-2 opacity-100 group-data-[collapsible=icon]:opacity-0")}
              />
            }
          >
            <PanelLeft className="size-[18px]" strokeWidth={TOGGLE_STROKE} />
          </TooltipTrigger>
          <TooltipContent side="right">Collapse</TooltipContent>
        </Tooltip>

        {/* Expand: beneath the mark, only while collapsed. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Open sidebar"
                inert={!collapsed}
                className={cn(TRIGGER, "top-[52px] left-2 opacity-0 group-data-[collapsible=icon]:opacity-100")}
              />
            }
          >
            <PanelLeft className="size-[18px]" strokeWidth={TOGGLE_STROKE} />
          </TooltipTrigger>
          <TooltipContent side="right">Open sidebar</TooltipContent>
        </Tooltip>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-1 pb-2">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="New session"
                  onClick={() => router.push("/session")}
                  className="sb-btn"
                >
                  <Plus strokeWidth={STROKE} />
                  <span>New session</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isAdminEmail(email) && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Recorded sessions"
                    isActive={pathname.startsWith("/admin")}
                    onClick={() => router.push("/admin")}
                    className={ITEM}
                  >
                    <ShieldCheck strokeWidth={STROKE} />
                    <span>Recorded sessions</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="text-sidebar-foreground/50">Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {sessions === null
                ? [72, 56, 64].map((w) => (
                    <SidebarMenuItem key={w}>
                      <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
                        <Skeleton className="size-4 rounded-md border border-sidebar-foreground/25 bg-transparent" />
                        <Skeleton className="h-3.5 rounded-md border border-sidebar-foreground/25 bg-transparent" style={{ width: `${w}%` }} />
                      </div>
                    </SidebarMenuItem>
                  ))
                : sessions.length === 0
                  ? (
                    <li className="px-2 py-1.5 text-[12.5px] text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
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
                          className={cn(ITEM, "relative pl-4")}
                        >
                          {/* The open session: a sky dot in the gutter, no outline or fill. */}
                          <span
                            aria-hidden
                            className={cn(
                              "absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full bg-(--lp-sky) transition-[opacity,scale] duration-200 ease-out",
                              active ? "scale-100 opacity-100" : "scale-50 opacity-0",
                            )}
                          />
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
        <SidebarMenu className="gap-1.5">
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Home" isActive={pathname === "/"} onClick={() => router.push("/")} className={ITEM}>
              <House strokeWidth={STROKE} />
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" isActive={pathname === "/settings"} onClick={() => router.push("/settings")} className={ITEM}>
              <SlidersHorizontal strokeWidth={STROKE} />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={name ?? "Account"} className={cn(ITEM, "mt-1")} />}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-foreground text-[11.5px] font-bold text-sidebar">
                  {initials(name, email)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium text-sidebar-foreground">{name ?? "Your account"}</span>
                  <span className="truncate text-[11.5px] text-sidebar-foreground/55">{email ?? ""}</span>
                </span>
                <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/55" strokeWidth={STROKE} />
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
      <SidebarRail className="after:bg-transparent hover:after:bg-(--lp-sky)" />
    </Sidebar>
  );
}
