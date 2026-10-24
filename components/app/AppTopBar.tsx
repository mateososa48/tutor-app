"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { HelpCircleIcon, Logout03Icon, Menu01Icon, Search01Icon, Settings01Icon, TeacherIcon } from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { CommandPalette } from "./CommandPalette";
import { Icon } from "./Icon";

// The sheet's top bar (Paper version A): search on the left, the account on
// the right, a hairline under it. ⌘K opens search from anywhere it is shown.

export function initials(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source[0].toUpperCase();
}

export function AppTopBar({ actions }: { actions?: ReactNode }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: auth } = useSession();
  const [searching, setSearching] = useState(false);
  const [mac, setMac] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the platform is only known in the browser
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearching((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const name = auth?.user?.name ?? null;
  const email = auth?.user?.email ?? null;

  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-(--lp-line) bg-white pr-3.5 pl-3 sm:pl-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isMobile && (
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            aria-label="Open menu"
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--lp-ink) outline-none hover:bg-(--lp-gray) focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
          >
            <Icon icon={Menu01Icon} size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setSearching(true)}
          aria-label="Search sessions and pages"
          aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
          className="group flex h-9 w-full max-w-[280px] min-w-0 cursor-pointer items-center gap-2 rounded-full border border-(--lp-gray-2) bg-white px-3 text-left outline-none transition-[border-color,background-color] duration-150 hover:border-(--lp-ink)/20 focus-visible:ring-3 focus-visible:ring-(--lp-sky-glow)"
        >
          <Icon icon={Search01Icon} size={16} className="text-(--lp-ink-2)" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-(--lp-ink-3)">Search sessions…</span>
          <kbd className="hidden shrink-0 font-sans text-[12px] text-(--lp-ink-3) sm:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Your account"
            className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-(--lp-sky) text-[13px] font-bold text-white outline-none transition-[scale,box-shadow] duration-150 hover:scale-[1.04] active:scale-95 focus-visible:shadow-[0_0_0_3px_var(--lp-sky-glow)] data-[popup-open]:shadow-[0_0_0_3px_var(--lp-sky-glow)] motion-reduce:hover:scale-100"
          >
            {initials(name, email)}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
                <span className="truncate text-[13.5px] font-medium text-(--lp-ink)">{name ?? "Your account"}</span>
                {email && <span className="truncate text-[12.5px] font-normal text-(--lp-ink-2)">{email}</span>}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/tutor" />}>
              <Icon icon={TeacherIcon} size={16} />
              Your tutor
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/settings" />}>
              <Icon icon={Settings01Icon} size={16} />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/help" />}>
              <Icon icon={HelpCircleIcon} size={16} />
              Help
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
              <Icon icon={Logout03Icon} size={16} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette open={searching} onOpenChange={setSearching} />
    </header>
  );
}
