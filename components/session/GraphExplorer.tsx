"use client";

// Explore (Sept 17 2026): a board graph opened as a live Desmos calculator.
// The student drags sliders and points, zooms, and types lines of their own;
// the tutor hears what changed (useGraphExplore), and the board graph takes
// the student's version on close. On a laptop it is a panel over the graph
// it came from, clear of the dock (lib/explore-panel.ts); on a phone, a
// bottom sheet. Neither is modal: the student keeps talking, and the board
// stays usable. One calculator exists at a time and is destroyed on close.

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Drawer } from "vaul";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { loadDesmosApi } from "@/components/board/desmos-renderer";
import {
  describeExploreChanges,
  diffExplore,
  exploreInvite,
  exploreItems,
  fitExploreBounds,
  initialSnapshot,
  snapshotOf,
  type ExploreExpressionState,
  type ExploreSnapshot,
} from "@/lib/desmos-explore";
import { DEFAULT_GRAPH_SETTINGS, type GraphBounds, type GraphSpec } from "@/lib/desmos-spec";
import { placeExplorePanel, type PanelRect } from "@/lib/explore-panel";
import { cn } from "@/lib/utils";
import type { ExploreShare, ExploreState } from "./useGraphExplore";

export type GraphExplorerHandle = {
  /** A JPEG of the live graph for the tutor, or null. */
  picture(): Promise<string | null>;
  /** Where the student has taken the graph, or null when nothing changed. */
  snapshot(): ExploreSnapshot | null;
};

type Props = {
  state: ExploreState;
  onChange: (description: string) => void;
  onClose: () => void;
  onExited: (itemId: string) => void;
};

type LiveCalculator = {
  setExpressions(list: unknown[]): void;
  getExpressions(): ExploreExpressionState[];
  setMathBounds(bounds: GraphBounds): void;
  updateSettings(settings: Record<string, unknown>): void;
  getState(): unknown;
  setState(state: unknown, options?: { allowUndo?: boolean }): void;
  setDefaultState(state: unknown): void;
  observeEvent(name: string, callback: () => void): void;
  unobserveEvent(name: string): void;
  asyncScreenshot(options: Record<string, unknown>, callback: (data: string) => void): void;
  resize(): void;
  destroy(): void;
  graphpaperBounds?: { pixelCoordinates?: { width: number; height: number } };
};

type CalcStatus = "loading" | "ready" | "error";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// What the student sees of the live calculator: the list (sliders live
// there), zoom buttons and the keypad; no settings, links or folders.
const CALCULATOR_OPTIONS = {
  expressions: true,
  expressionsCollapsed: false,
  expressionsTopbar: true,
  settingsMenu: false,
  zoomButtons: true,
  keypad: true,
  border: false,
  lockViewport: false,
  pointsOfInterest: true,
  trace: true,
  links: false,
  sliders: true,
  notes: false,
  folders: false,
  images: false,
  actions: false,
  pasteGraphLink: false,
  accentColor: "#1d7ee6",
  autosize: true,
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// Desmos screenshots are PNGs; the tutor gets JPEGs like every other picture.
function toJpeg(png: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("unreadable screenshot"));
    img.src = png;
  });
}

// Inside a Desmos math field, Escape leaves the field; outside, it closes the panel.
function inMathField(host: HTMLElement | null): boolean {
  const el = document.activeElement;
  if (!host || !el || !host.contains(el)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "textarea" || tag === "input" || (el as HTMLElement).isContentEditable;
}

// Opens the live calculator in `host` once `ready` (after the panel has
// settled: Desmos measures its box when it starts).
function useLiveCalculator(host: HTMLDivElement | null, ready: boolean, spec: GraphSpec, onChange: (description: string) => void) {
  const [status, setStatus] = useState<CalcStatus>("loading");
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const calcRef = useRef<LiveCalculator | null>(null);
  const snapRef = useRef<ExploreSnapshot | null>(null);
  const initialRef = useRef<unknown>(null);
  // The student's state survives the calculator being rebuilt (a window crossing the phone width).
  const keptRef = useRef<unknown>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!host || !ready) return;
    let calc: LiveCalculator | null = null;
    let cancelled = false;
    const start = initialSnapshot(spec);
    void (async () => {
      try {
        const Desmos = await loadDesmosApi();
        if (cancelled) return;
        calc = Desmos.GraphingCalculator(host, CALCULATOR_OPTIONS) as LiveCalculator;
        calc.updateSettings({ ...DEFAULT_GRAPH_SETTINGS, ...spec.settings });
        calc.setExpressions(exploreItems(spec));
        await nextFrame();
        if (cancelled) return;
        const paper = calc.graphpaperBounds?.pixelCoordinates;
        const size = paper && paper.width > 0 && paper.height > 0 ? { w: paper.width, h: paper.height } : { w: host.clientWidth, h: host.clientHeight };
        calc.setMathBounds(fitExploreBounds(spec.bounds, spec.size, size));
        initialRef.current ??= calc.getState();
        // Desmos's own reset button in the list returns here, not to a blank graph.
        calc.setDefaultState(initialRef.current);
        if (keptRef.current) calc.setState(keptRef.current);
        const live = calc;
        live.observeEvent("change.explore", () => {
          const snap = snapshotOf(live.getExpressions(), spec);
          const text = describeExploreChanges(diffExplore(start, snap));
          snapRef.current = text ? snap : null;
          setDirty(text !== "");
          onChangeRef.current(text);
        });
        calcRef.current = live;
        // Scripted checks drive the live graph through this (development only).
        if (process.env.NODE_ENV !== "production") (window as unknown as { __chalkExplore?: unknown }).__chalkExplore = live;
        setStatus("ready");
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.warn("[Explore] the live graph did not open:", err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      calcRef.current = null;
      if (!calc) return;
      const w = window as unknown as { __chalkExplore?: unknown };
      if (w.__chalkExplore === calc) delete w.__chalkExplore;
      try {
        keptRef.current = calc.getState();
        calc.unobserveEvent("change.explore");
        calc.destroy();
      } catch {
        // already gone
      }
    };
  }, [host, ready, spec, attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  const reset = useCallback(() => {
    const calc = calcRef.current;
    if (calc && initialRef.current) calc.setState(initialRef.current, { allowUndo: true });
  }, []);

  const picture = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        const calc = calcRef.current;
        if (!calc) return resolve(null);
        const paper = calc.graphpaperBounds?.pixelCoordinates;
        const width = 640;
        const height = paper && paper.width > 0 ? Math.round(Math.min(640, (width * paper.height) / paper.width)) : 480;
        const timer = window.setTimeout(() => resolve(null), 3000);
        calc.asyncScreenshot({ width, height, targetPixelRatio: 1, showLabels: true, showMovablePoints: true }, (data) => {
          window.clearTimeout(timer);
          toJpeg(String(data ?? "")).then(resolve, () => resolve(null));
        });
      }),
    [],
  );

  const snapshot = useCallback(() => snapRef.current, []);
  const resize = useCallback(() => calcRef.current?.resize(), []);
  return { status, dirty, retry, reset, picture, snapshot, resize };
}

export const GraphExplorer = forwardRef<GraphExplorerHandle, Props>(function GraphExplorer({ state, onChange, onClose, onExited }, ref) {
  const phone = useIsMobile();
  const { target, open, erased, share } = state;
  const itemId = target.itemId;
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [settled, setSettled] = useState(false);
  const live = useLiveCalculator(host, settled || phone, target.spec, onChange);
  const titleId = useId();
  const hintId = useId();
  const panelRef = useRef<HTMLElement | null>(null);

  useImperativeHandle(ref, () => ({ picture: live.picture, snapshot: live.snapshot }), [live.picture, live.snapshot]);

  // Focus moves into the panel once it is there (a sheet's portal mounts a
  // render late) and back to the graph's button when it closes.
  const focusedRef = useRef(false);
  const attachPanel = useCallback((el: HTMLElement | null) => {
    panelRef.current = el;
    if (el && !focusedRef.current) {
      focusedRef.current = true;
      el.focus({ preventScroll: true });
    }
  }, []);
  const requestClose = useCallback(() => {
    const hadFocus = Boolean(panelRef.current?.contains(document.activeElement));
    onClose();
    if (!hadFocus) return;
    requestAnimationFrame(() => {
      const button = document.querySelector<HTMLElement>(`[data-explore-item="${itemId}"]`);
      (button ?? document.querySelector<HTMLElement>(".tl-container"))?.focus({ preventScroll: true });
    });
  }, [itemId, onClose]);

  const onKeyDownCapture = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    if (inMathField(host)) {
      (document.activeElement as HTMLElement | null)?.blur();
      panelRef.current?.focus({ preventScroll: true });
      return;
    }
    requestClose();
  };

  const body = (
    <ExplorerBody
      hostRef={setHost}
      status={live.status}
      erased={erased}
      onRetry={live.retry}
      onClose={requestClose}
    />
  );
  const header = (
    <ExplorerHeader
      titleId={titleId}
      hintId={hintId}
      label={target.label}
      invite={exploreInvite(target.spec)}
      canReset={live.status === "ready" && live.dirty && !erased}
      onReset={live.reset}
      onClose={requestClose}
      compact={phone}
    />
  );
  const footer = <ShareLine share={share} erased={erased} safeArea={phone} />;

  if (phone) {
    return (
      <Drawer.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        onAnimationEnd={(isOpen) => {
          if (!isOpen) onExited(itemId);
        }}
        modal={false}
        handleOnly
        noBodyStyles
      >
        <Drawer.Portal>
          <Drawer.Content
            ref={attachPanel}
            tabIndex={-1}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onKeyDownCapture={onKeyDownCapture}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(100dvh-60px)] flex-col overflow-hidden rounded-t-[20px] border border-b-0 border-(--lp-line-strong) bg-white font-[family-name:var(--lp-font-body)] shadow-[0_-10px_32px_rgba(18,18,21,0.10)] outline-none"
          >
            <Drawer.Handle className="mt-2" />
            {header}
            {body}
            {footer}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <DesktopPanel
      open={open}
      graph={target.rect}
      attachPanel={attachPanel}
      titleId={titleId}
      hintId={hintId}
      onKeyDownCapture={onKeyDownCapture}
      onSettled={() => {
        setSettled(true);
        live.resize();
      }}
      onExited={() => onExited(itemId)}
    >
      {header}
      {body}
      {footer}
    </DesktopPanel>
  );
});

function DesktopPanel({
  open,
  graph,
  attachPanel,
  titleId,
  hintId,
  onKeyDownCapture,
  onSettled,
  onExited,
  children,
}: {
  open: boolean;
  graph: PanelRect;
  attachPanel: (el: HTMLElement | null) => void;
  titleId: string;
  hintId: string;
  onKeyDownCapture: (e: KeyboardEvent) => void;
  onSettled: () => void;
  onExited: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBoard({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const rect = board ? placeExplorePanel(graph, board) : null;
  // The panel grows out of the graph it came from.
  const origin = rect ? `${Math.round(graph.x + graph.w / 2 - rect.x)}px ${Math.round(graph.y + graph.h / 2 - rect.y)}px` : "50% 50%";
  const settledOnce = useRef(false);
  const settle = () => {
    if (settledOnce.current) return;
    settledOnce.current = true;
    onSettled();
  };

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0 z-40">
      <AnimatePresence onExitComplete={onExited}>
        {open && rect && (
          <motion.section
            key="panel"
            ref={attachPanel}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            aria-describedby={hintId}
            tabIndex={-1}
            onKeyDownCapture={onKeyDownCapture}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(0.96)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "scale(1)" }}
            exit={reduce ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, transform: "scale(0.98)", transition: { duration: 0.15, ease: EASE_OUT } }}
            transition={{ duration: reduce ? 0.12 : 0.22, ease: EASE_OUT }}
            onAnimationComplete={settle}
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, transformOrigin: origin }}
            className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-[20px] border border-(--lp-line-strong) bg-white font-[family-name:var(--lp-font-body)] shadow-[0_1px_2px_rgba(18,18,21,0.05),0_12px_36px_rgba(18,18,21,0.12)] outline-none"
          >
            {children}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExplorerHeader({
  titleId,
  hintId,
  label,
  invite,
  canReset,
  onReset,
  onClose,
  compact,
}: {
  titleId: string;
  hintId: string;
  label: string;
  invite: string;
  canReset: boolean;
  onReset: () => void;
  onClose: () => void;
  compact: boolean;
}) {
  // On a phone, vaul's Title and Description label the sheet with ids of
  // their own: passing any id, even undefined, would replace them.
  const Title = compact ? Drawer.Title : "h2";
  const Hint = compact ? Drawer.Description : "p";
  return (
    <header className="flex shrink-0 items-start gap-2 py-3 pr-3 pl-4">
      <div className="min-w-0 flex-1 pt-0.5">
        <Title {...(compact ? {} : { id: titleId })} className="truncate text-[15px] leading-5 font-semibold text-(--lp-ink)">
          Explore
          {label && <span className="font-normal text-(--lp-ink-2)"> · {label}</span>}
        </Title>
        <Hint {...(compact ? {} : { id: hintId })} className="mt-0.5 text-[13px] leading-[18px] text-(--lp-ink-2)">
          {invite}
        </Hint>
      </div>
      {compact ? (
        <Button variant="ghost" size="icon-lg" onClick={onReset} disabled={!canReset} aria-label="Reset the graph" className={HIT}>
          <RotateCcw className="size-[18px]" strokeWidth={2} />
        </Button>
      ) : (
        <Button variant="outline" size="lg" onClick={onReset} disabled={!canReset} className={cn("rounded-full px-3 text-[13px]", HIT)}>
          <RotateCcw strokeWidth={2} />
          Reset
        </Button>
      )}
      <Button variant="ghost" size="icon-lg" onClick={onClose} aria-label="Close Explore" className={cn("rounded-full", HIT)}>
        <X className="size-[18px]" strokeWidth={2} />
      </Button>
    </header>
  );
}

// 36 px controls with a 44 px target.
const HIT = "relative after:absolute after:-inset-1 after:content-['']";

function ExplorerBody({
  hostRef,
  status,
  erased,
  onRetry,
  onClose,
}: {
  hostRef: (el: HTMLDivElement | null) => void;
  status: CalcStatus;
  erased: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative min-h-0 flex-1 border-t border-(--lp-line)">
      <div ref={hostRef} className="absolute inset-0" />
      {status === "loading" && <GridSkeleton />}
      {status === "error" && (
        <Notice title="The live graph didn't open." detail="Check your connection, then try again.">
          <Button variant="outline" size="lg" onClick={onRetry} className="rounded-full px-4">
            Try again
          </Button>
        </Notice>
      )}
      {erased && (
        <Notice title="Your tutor erased this graph." detail="Close this to go back to the board.">
          <Button size="lg" onClick={onClose} className="px-4">
            Close
          </Button>
        </Notice>
      )}
    </div>
  );
}

// A faint grid where the calculator is about to appear.
function GridSkeleton() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 bg-white"
      style={{
        backgroundImage: "linear-gradient(to right, #f0f0f3 1px, transparent 1px), linear-gradient(to bottom, #f0f0f3 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        backgroundPosition: "center",
      }}
    />
  );
}

function Notice({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/92 px-6 text-center backdrop-blur-[2px]">
      <p className="text-[15px] leading-5 font-semibold text-(--lp-ink)">{title}</p>
      <p className="mb-3 text-[13px] leading-[18px] text-(--lp-ink-2)">{detail}</p>
      {children}
    </div>
  );
}

const SHARE_TEXT: Record<ExploreShare, string> = {
  idle: "Your tutor will see what you change.",
  pending: "Your tutor will see this when you pause.",
  sent: "Your tutor has seen your changes.",
  offline: "Close this to keep your changes on the board.",
};

function ShareLine({ share, erased, safeArea }: { share: ExploreShare; erased: boolean; safeArea: boolean }) {
  if (erased) return null;
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex min-h-9 shrink-0 items-center gap-1.5 border-t border-(--lp-line) px-4 text-[12.5px] text-(--lp-ink-2)",
        safeArea && "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {share === "sent" ? (
        <Check aria-hidden className="size-3.5 text-(--lp-sky-deep)" strokeWidth={2.4} />
      ) : (
        <span aria-hidden className={cn("size-1.5 rounded-full", share === "pending" ? "bg-(--lp-sky)" : "bg-(--lp-gray-2)")} />
      )}
      {SHARE_TEXT[share]}
    </p>
  );
}
