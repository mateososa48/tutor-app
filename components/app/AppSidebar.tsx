"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ChartHistogramIcon,
  Clock04Icon,
  HelpCircleIcon,
  Home05Icon,
  PencilEdit02Icon,
  Settings01Icon,
  ShieldUserIcon,
  SidebarLeftIcon,
  SquareLock02Icon,
  Target02Icon,
  TeacherIcon,
} from "@hugeicons/core-free-icons";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isAdminEmail } from "@/lib/admin-emails";
import { cn } from "@/lib/utils";
import { ChalkMark } from "./ChalkMark";
import { Icon } from "./Icon";

// The rail (Paper "Sidebar", version A, Oct 2026): the window is this black,
// and every page is a white sheet inset beside it. Rows are plain: no fills,
// no outlines, no lifts. Hover brightens the words, the current page shows a
// sky icon and medium-weight words, and keyboard focus is the one sky ring.
// Groups are split by full-bleed hairlines. Collapsed, the rail is 64px of
// icons with tooltips.

type NavItem = { href: string; label: string; icon: IconSvgElement; match?: (path: string) => boolean };

const GROUPS: NavItem[][] = [
  [
    { href: "/", label: "Home", icon: Home05Icon, match: (p) => p === "/" },
    { href: "/session", label: "New session", icon: PencilEdit02Icon, match: (p) => p === "/session" },
    { href: "/sessions", label: "Sessions", icon: Clock04Icon, match: (p) => p === "/sessions" || /^\/session\/[^/]+/.test(p) },
  ],
  [
    { href: "/progress", label: "Progress", icon: ChartHistogramIcon },
    { href: "/practice", label: "Practice", icon: Target02Icon },
  ],
  [
    { href: "/tutor", label: "Your tutor", icon: TeacherIcon },
    { href: "/settings", label: "Settings", icon: Settings01Icon },
    { href: "/help", label: "Help", icon: HelpCircleIcon },
  ],
];

const ADMIN: NavItem = { href: "/admin", label: "Recorded sessions", icon: ShieldUserIcon };
const PRIVACY: NavItem = { href: "/privacy", label: "Privacy & data", icon: SquareLock02Icon };

const EASE = "ease-[cubic-bezier(0.16,1,0.3,1)]";
const HAIRLINE = "border-t border-[#26262b]";

function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.href || path.startsWith(`${item.href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const { data: auth } = useSession();
  const collapsed = !isMobile && state === "collapsed";
  const admin = isAdminEmail(auth?.user?.email ?? null);
  const groups = admin ? [...GROUPS.slice(0, 2), [...GROUPS[2], ADMIN]] : GROUPS;
  // A tapped link closes the phone's sheet.
  const onNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className={cn("relative h-[52px] shrink-0 overflow-hidden p-0 transition-[height] duration-300 group-data-[collapsible=icon]:h-[92px]", EASE)}>
        <RailTip label="Home" show={collapsed}>
          <Link
            href="/"
            onClick={onNavigate}
            aria-label="Chalk home"
            className="absolute top-[13px] left-[13px] flex h-7 items-center gap-[7px] rounded-[8px] px-[5px] outline-none focus-visible:shadow-[0_0_0_2px_var(--lp-sky)]"
          >
            <ChalkMark size={25} />
            <span
              className={cn(
                "lp-brand text-[18px] text-(--sidebar-foreground) transition-opacity duration-200",
                collapsed ? "pointer-events-none opacity-0" : "opacity-100",
              )}
            >
              chalk
            </span>
          </Link>
        </RailTip>

        {!isMobile && (
          <>
            {/* Collapse sits at the header's right while open; expand sits under the mark while collapsed. */}
            <RailTip label="Collapse  ⌘B" show>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                inert={collapsed}
                className={cn(TOGGLE, "top-[13px] right-3 opacity-100 group-data-[collapsible=icon]:opacity-0")}
              >
                <Icon icon={SidebarLeftIcon} size={18} />
              </button>
            </RailTip>
            <RailTip label="Open sidebar  ⌘B" show>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Open sidebar"
                inert={!collapsed}
                className={cn(TOGGLE, "top-[52px] left-[16px] opacity-0 group-data-[collapsible=icon]:opacity-100")}
              >
                <Icon icon={SidebarLeftIcon} size={18} />
              </button>
            </RailTip>
          </>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-x-hidden">
        <nav aria-label="Main" className="flex flex-col">
          {groups.map((group, i) => (
            <ul key={i} className={cn("m-0 flex list-none flex-col p-0", i === 0 ? "pt-1.5 pb-3" : cn(HAIRLINE, "py-3"))}>
              {group.map((item) => (
                <li key={item.href}>
                  <RailRow item={item} active={isActive(item, pathname)} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className={cn(HAIRLINE, "gap-0 p-0 pt-2.5 pb-2")}>
        <RailRow item={PRIVACY} active={isActive(PRIVACY, pathname)} collapsed={collapsed} onNavigate={onNavigate} quiet />
      </SidebarFooter>
      <SidebarRail className="after:bg-transparent hover:after:bg-(--lp-sky)" />
    </Sidebar>
  );
}

const TOGGLE =
  "absolute flex size-8 cursor-pointer items-center justify-center rounded-[8px] text-[rgba(236,236,239,0.7)] outline-none transition-[opacity,color,scale] duration-200 hover:text-white active:scale-95 focus-visible:shadow-[0_0_0_2px_var(--lp-sky)] motion-reduce:active:scale-100";

function RailRow({
  item,
  active,
  collapsed,
  onNavigate,
  quiet = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  quiet?: boolean;
}) {
  return (
    <RailTip label={item.label} show={collapsed}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group/row relative mx-1.5 flex h-9 items-center gap-3 rounded-[8px] px-[14px] whitespace-nowrap outline-none",
          "transition-[color,padding] duration-300",
          EASE,
          "group-data-[collapsible=icon]:px-[17px]",
          quiet ? "text-[13px] text-[#9c9ca3]" : "text-[14px] text-[#c4c4c9]",
          active ? "font-medium text-[#f4f4f6]" : "hover:text-[#f4f4f6]",
          "focus-visible:text-[#f4f4f6] focus-visible:shadow-[inset_0_0_0_2px_var(--lp-sky)]",
        )}
      >
        <Icon
          icon={item.icon}
          size={quiet ? 16 : 18}
          className={cn("transition-colors duration-150", active ? "text-(--lp-sky)" : "text-current", quiet && "mx-px")}
        />
        <span className={cn("transition-opacity duration-200", collapsed ? "pointer-events-none opacity-0" : "opacity-100")}>{item.label}</span>
      </Link>
    </RailTip>
  );
}

/** A tooltip to the right of the rail, only while it is collapsed. */
function RailTip({ label, show, children }: { label: string; show: boolean; children: React.ReactElement }) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
