"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ChevronsUpDown, House, LogOut, NotebookPen, Plus, SlidersHorizontal } from "lucide-react";
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
import { Wordmark } from "@/components/landing/Wordmark";
import { getRecentSessions, type SavedSession } from "@/lib/sessions";
import { useClientReady } from "@/lib/client-ready";

function initials(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useClientReady();
  const { state } = useSidebar();
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
      <SidebarHeader className="h-[52px] justify-center px-3 group-data-[collapsible=icon]:px-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex h-8 items-center rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label="Home"
        >
          <Wordmark size={16} iconOnly={collapsed} />
        </button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="New session"
                  isActive={pathname === "/session"}
                  onClick={() => router.push("/session")}
                  className="font-medium"
                >
                  <Plus strokeWidth={2.2} />
                  <span>New session</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sessions === null
                ? [72, 56, 64].map((w) => (
                    <SidebarMenuItem key={w}>
                      <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
                        <Skeleton className="size-4 rounded-md" />
                        <Skeleton className="h-3.5 rounded-md" style={{ width: `${w}%` }} />
                      </div>
                    </SidebarMenuItem>
                  ))
                : sessions.length === 0
                  ? (
                    <li className="px-2 py-1.5 text-[12.5px] text-(--lp-ink-3) group-data-[collapsible=icon]:hidden">
                      Sessions you start will show up here.
                    </li>
                  )
                  : sessions.map((s) => (
                    <SidebarMenuItem key={s.id}>
                      <SidebarMenuButton
                        tooltip={s.title}
                        isActive={pathname === `/session/${s.id}`}
                        onClick={() => router.push(`/session/${s.id}`)}
                      >
                        <NotebookPen strokeWidth={1.8} />
                        <span>{s.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-0.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Home" isActive={pathname === "/"} onClick={() => router.push("/")}>
              <House strokeWidth={1.8} />
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" isActive={pathname === "/settings"} onClick={() => router.push("/settings")}>
              <SlidersHorizontal strokeWidth={1.8} />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg" tooltip={name ?? "Account"} className="mt-1 data-open:bg-sidebar-accent" />
                }
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-(--lp-ink) text-[11.5px] font-semibold text-white">
                  {initials(name, email)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium">{name ?? "Your account"}</span>
                  <span className="truncate text-[11.5px] text-(--lp-ink-3)">{email ?? ""}</span>
                </span>
                <ChevronsUpDown className="ml-auto size-4 text-(--lp-ink-3)" />
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
      <SidebarRail />
    </Sidebar>
  );
}
