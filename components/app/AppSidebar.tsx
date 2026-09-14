"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ChevronsUpDown, House, LogOut, PanelLeft, Plus, SlidersHorizontal } from "lucide-react";
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
// globals.css): white strokes, no tinted fills. The New session button rests
// flat and lifts on hover; the current page is a flat outlined item. The mark
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
            <ChalkMark size={24} />
            {!collapsed && <span className="lp-display animate-in fade-in text-[16.5px] tracking-[-0.02em] text-white duration-300">chalk</span>}
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
            <PanelLeft className="size-5" strokeWidth={STROKE} />
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
            <PanelLeft className="size-5" strokeWidth={STROKE} />
          </TooltipTrigger>
          <TooltipContent side="right">Open sidebar</TooltipContent>
        </Tooltip>
      </SidebarHeader>

      <SidebarContent>
        {/* The button lifts 2px up and to the left on hover; the group's
            padding leaves room for it. */}
        <SidebarGroup className="pt-1 pb-3">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="New session"
                  onClick={() => router.push("/session")}
                  className="sb-btn h-10 px-3 text-[14px] group-data-[collapsible=icon]:p-1.5!"
                >
                  <Plus strokeWidth={2.75} />
                  <span>New session</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="text-white/50">Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {sessions === null
                ? [72, 56, 64].map((w) => (
                    <SidebarMenuItem key={w}>
                      <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
                        <Skeleton className="size-4 rounded-md border border-white/30 bg-transparent" />
                        <Skeleton className="h-3.5 rounded-md border border-white/30 bg-transparent" style={{ width: `${w}%` }} />
                      </div>
                    </SidebarMenuItem>
                  ))
                : sessions.length === 0
                  ? (
                    <li className="px-2 py-1.5 text-[12.5px] text-white/55 group-data-[collapsible=icon]:hidden">
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
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-[11.5px] font-bold text-black">
                  {initials(name, email)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium text-white">{name ?? "Your account"}</span>
                  <span className="truncate text-[11.5px] text-white/55">{email ?? ""}</span>
                </span>
                <ChevronsUpDown className="ml-auto size-4 text-white/55" strokeWidth={STROKE} />
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
