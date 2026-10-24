"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ChartHistogramIcon,
  Clock04Icon,
  HelpCircleIcon,
  Home05Icon,
  PencilEdit02Icon,
  Search01Icon,
  Settings01Icon,
  SquareLock02Icon,
  Target02Icon,
  TeacherIcon,
} from "@hugeicons/core-free-icons";
import { sessionHeadline, sessionMeta } from "@/lib/home-stats";
import type { SavedSession } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";
import { fetchSessionList } from "./useSessionList";

// ⌘K: find a past session by what it was about, or jump to a page. Sessions
// match on their title and recap, every word of the query has to appear.

type Result =
  | { kind: "page"; key: string; label: string; hint: string; icon: IconSvgElement; href: string }
  | { kind: "session"; key: string; label: string; hint: string; meta: string; href: string };

const PAGES: Extract<Result, { kind: "page" }>[] = [
  { kind: "page", key: "p-new", label: "New session", hint: "Start with a problem or a photo", icon: PencilEdit02Icon, href: "/session" },
  { kind: "page", key: "p-home", label: "Home", hint: "This week and what to work on", icon: Home05Icon, href: "/" },
  { kind: "page", key: "p-sessions", label: "Sessions", hint: "Every session you've had", icon: Clock04Icon, href: "/sessions" },
  { kind: "page", key: "p-progress", label: "Progress", hint: "Time practised and skills", icon: ChartHistogramIcon, href: "/progress" },
  { kind: "page", key: "p-practice", label: "Practice", hint: "Reviews due and lessons", icon: Target02Icon, href: "/practice" },
  { kind: "page", key: "p-tutor", label: "Your tutor", hint: "Voice, teaching style, memory", icon: TeacherIcon, href: "/tutor" },
  { kind: "page", key: "p-settings", label: "Settings", hint: "Account, sessions, microphone", icon: Settings01Icon, href: "/settings" },
  { kind: "page", key: "p-help", label: "Help", hint: "How sessions work, shortcuts", icon: HelpCircleIcon, href: "/help" },
  { kind: "page", key: "p-privacy", label: "Privacy & data", hint: "What's kept, download, delete", icon: SquareLock02Icon, href: "/privacy" },
];

const words = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean);

function sessionResult(s: SavedSession): Extract<Result, { kind: "session" }> {
  const { title, recap } = sessionHeadline(s);
  return {
    kind: "session",
    key: s.id,
    label: title,
    hint: recap,
    meta: sessionMeta(s),
    href: s.status === "ended" ? `/session/${s.id}/summary` : `/session/${s.id}`,
  };
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<SavedSession[] | null>(null);
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void fetchSessionList(200).then((list) => {
      if (live) setSessions(list);
    });
    return () => {
      live = false;
    };
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = words(query);
    const all = (sessions ?? []).map(sessionResult);
    if (q.length === 0) return [...PAGES.slice(0, 1), ...all.slice(0, 6), ...PAGES.slice(1)];
    const hit = (text: string) => q.every((w) => text.toLowerCase().includes(w));
    const pages = PAGES.filter((p) => hit(`${p.label} ${p.hint}`));
    const found = all.filter((s) => hit(`${s.label} ${s.hint}`)).slice(0, 12);
    return [...found, ...pages];
  }, [query, sessions]);

  const safeCursor = Math.min(cursor, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${safeCursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeCursor]);

  function go(result: Result | undefined) {
    if (!result) return;
    onOpenChange(false);
    router.push(result.href);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, Math.min(c, results.length - 1) + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, Math.min(c, results.length - 1) - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[safeCursor]);
    }
  }

  const sessionCount = results.filter((r) => r.kind === "session").length;
  const emptySearch = query.trim() && results.length === 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
          setCursor(0);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--lp-ink)/20 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          aria-label="Search"
          className={cn(
            "fixed top-[12vh] left-1/2 z-50 flex max-h-[min(560px,76vh)] w-[calc(100vw-24px)] max-w-[600px] -translate-x-1/2 flex-col overflow-hidden rounded-[20px] bg-white outline-none",
            "shadow-[0_0_0_1px_rgba(18,18,21,0.08),0_16px_40px_rgba(18,18,21,0.16)]",
            "origin-top transition-[scale,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 motion-reduce:data-[starting-style]:scale-100",
          )}
        >
          <Dialog.Title className="sr-only">Search sessions and pages</Dialog.Title>
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-(--lp-line) px-4.5">
            <Icon icon={Search01Icon} size={18} className="text-(--lp-ink-2)" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onKey}
              placeholder="Search sessions, or go to a page"
              aria-label="Search sessions, or go to a page"
              aria-controls="palette-results"
              aria-activedescendant={results[safeCursor] ? `palette-${results[safeCursor].key}` : undefined}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-(--lp-ink) outline-none placeholder:text-(--lp-ink-3)"
            />
            <kbd className="rounded-[6px] bg-(--lp-gray) px-1.5 py-0.5 font-sans text-[11.5px] font-medium text-(--lp-ink-2)">esc</kbd>
          </div>

          <ul id="palette-results" ref={listRef} role="listbox" aria-label="Results" className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2">
            {emptySearch ? (
              <li className="px-3 py-8 text-center text-[14px] text-(--lp-ink-2)">
                Nothing matches &ldquo;{query.trim()}&rdquo;.
              </li>
            ) : (
              results.map((result, index) => {
                const firstOfKind = index === 0 || results[index - 1].kind !== result.kind;
                const heading = result.kind === "session" ? (query.trim() ? "Sessions" : "Recent sessions") : query.trim() || index > 0 ? "Pages" : null;
                return (
                  <li key={result.key} role="presentation">
                    {firstOfKind && heading && (sessionCount > 0 || result.kind === "page") && (
                      <p className="m-0 px-3 pt-2.5 pb-1.5 text-[12px] font-medium text-(--lp-ink-3)">{heading}</p>
                    )}
                    <div
                      id={`palette-${result.key}`}
                      role="option"
                      aria-selected={index === safeCursor}
                      data-index={index}
                      onMouseMove={() => setCursor(index)}
                      onClick={() => go(result)}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2",
                        index === safeCursor ? "bg-(--lp-gray)" : "",
                      )}
                    >
                      {result.kind === "page" ? (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-(--lp-line) bg-white text-(--lp-ink)">
                          <Icon icon={result.icon} size={16} />
                        </span>
                      ) : (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-(--lp-sky-tint) text-(--lp-sky-deep)">
                          <Icon icon={Clock04Icon} size={16} />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[14px] font-medium text-(--lp-ink)">{result.label}</span>
                        {result.hint && <span className="truncate text-[12.5px] text-(--lp-ink-2)">{result.hint}</span>}
                      </span>
                      {result.kind === "session" && <span className="shrink-0 text-[12.5px] text-(--lp-ink-3) tabular-nums">{result.meta}</span>}
                    </div>
                  </li>
                );
              })
            )}
            {sessions === null && !query.trim() && <li className="px-3 pt-1 pb-2 text-[12.5px] text-(--lp-ink-3)">Loading your sessions…</li>}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
