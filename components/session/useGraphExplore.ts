"use client";

// Explore's bookkeeping (Sept 17 2026), shared by the session page and
// /dev/board: which graph is open, what the student has changed, when the
// tutor hears about it (lib/explore-report.ts: after a pause, only while
// nobody is talking), and the board graph taking the student's version when
// the panel closes. GraphExplorer is the view; the caller supplies the
// channel to the tutor.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExploreTarget, WhiteboardHandle } from "@/components/Whiteboard";
import { applyExploreSnapshot } from "@/lib/desmos-explore";
import {
  createExploreReporter,
  exploreEventText,
  exploreReportDue,
  finalExploreReport,
  markExploreSent,
  noteExploreChange,
  type ExploreReporter,
} from "@/lib/explore-report";
import type { GraphExplorerHandle } from "./GraphExplorer";

/** What the student is told about the tutor: nothing changed yet, a change not yet shared, shared, or no tutor to tell. */
export type ExploreShare = "idle" | "pending" | "sent" | "offline";

export type ExploreState = {
  target: ExploreTarget;
  /** False while the panel animates away. */
  open: boolean;
  /** The tutor erased the graph while it was open. */
  erased: boolean;
  share: ExploreShare;
};

export type ExploreReport = {
  itemId: string;
  /** What changed, in words. */
  text: string;
  /** The whole session event for the tutor. */
  event: string;
  /** A picture of the live graph (a JPEG data URL), sent before the event. Null after closing: the board picture shows it then. */
  picture: string | null;
  closed: boolean;
};

export type ExploreChannel = {
  /** Whether reports can reach the tutor at all in this session. */
  canReport(): boolean;
  /** Nobody is talking and the tutor is not busy, so a report will not cut anyone off. */
  isQuiet(): boolean;
  /** Send one report; resolves to whether it went. */
  report(report: ExploreReport): Promise<boolean>;
  log(label: string, detail: Record<string, unknown>): void;
};

const TICK_MS = 500;
// A closed panel's last change waits this long for a quiet moment, then is dropped.
const FINAL_WAIT_MS = 30_000;
const RESET_TEXT = "put the graph back the way it started";

type Open = { itemId: string; reporter: ExploreReporter };

export function useGraphExplore(board: () => WhiteboardHandle | null, channel: ExploreChannel) {
  const [state, setState] = useState<ExploreState | null>(null);
  const explorerRef = useRef<GraphExplorerHandle>(null);
  const openRef = useRef<Open | null>(null);
  const finalRef = useRef<{ itemId: string; text: string; until: number } | null>(null);
  const sendingRef = useRef(false);
  const boardRef = useRef(board);
  const channelRef = useRef(channel);
  useEffect(() => {
    boardRef.current = board;
    channelRef.current = channel;
  });

  const share = useCallback((itemId: string, next: ExploreShare) => {
    setState((s) => (s && s.target.itemId === itemId && s.share !== next ? { ...s, share: next } : s));
  }, []);

  const send = useCallback(async (itemId: string, text: string, closed: boolean, reporter: ExploreReporter | null) => {
    sendingRef.current = true;
    try {
      const picture = closed ? null : (await explorerRef.current?.picture()) ?? null;
      const sent = await channelRef.current.report({ itemId, text, event: exploreEventText(itemId, text, closed), picture, closed });
      channelRef.current.log(closed ? "report_final" : "report", { itemId, text, sent, picture: Boolean(picture) });
      if (reporter && openRef.current?.reporter === reporter) {
        if (sent) {
          if (reporter.pending === text) share(itemId, "sent");
        } else {
          // Try again at the next quiet moment.
          reporter.lastSent = "";
        }
      }
    } catch (err) {
      channelRef.current.log("report_failed", { itemId, text, error: err instanceof Error ? err.message : String(err) });
      if (reporter) reporter.lastSent = "";
    } finally {
      sendingRef.current = false;
    }
  }, [share]);

  const close = useCallback(() => {
    const current = openRef.current;
    if (!current) return;
    const snapshot = explorerRef.current?.snapshot() ?? null;
    openRef.current = null;
    const wb = boardRef.current();
    const graph = wb?.getGraph?.(current.itemId) ?? null;
    let applied = false;
    if (graph && snapshot) {
      const next = applyExploreSnapshot(graph.spec, snapshot);
      if (next !== graph.spec) applied = wb?.applyGraphSpec?.(current.itemId, next) ?? false;
    }
    const unsent = graph ? finalExploreReport(current.reporter) : null;
    if (unsent && channelRef.current.canReport()) finalRef.current = { itemId: current.itemId, text: unsent, until: Date.now() + FINAL_WAIT_MS };
    channelRef.current.log("closed", { itemId: current.itemId, applied, erased: !graph, unsent });
    setState((s) => (s && s.target.itemId === current.itemId ? { ...s, open: false } : s));
  }, []);

  /** The Explore button: opens its graph, or closes it when it is the one open. */
  const open = useCallback((target: ExploreTarget) => {
    const current = openRef.current;
    if (current?.itemId === target.itemId) {
      close();
      return;
    }
    if (current) close();
    openRef.current = { itemId: target.itemId, reporter: createExploreReporter(Date.now()) };
    setState({ target, open: true, erased: false, share: channelRef.current.canReport() ? "idle" : "offline" });
    channelRef.current.log("opened", { itemId: target.itemId, kind: target.spec.kind });
  }, [close]);

  /** The live graph changed; `description` says how it differs from where it started ("" for not at all). */
  const change = useCallback((description: string) => {
    const current = openRef.current;
    if (!current) return;
    const { reporter } = current;
    const text = description || (reporter.lastSent ? RESET_TEXT : "");
    noteExploreChange(reporter, text, Date.now());
    const next: ExploreShare = !channelRef.current.canReport() ? "offline" : !text ? "idle" : text === reporter.lastSent ? "sent" : "pending";
    share(current.itemId, next);
  }, [share]);

  /** The panel finished animating away. */
  const exited = useCallback((itemId: string) => {
    setState((s) => (s && s.target.itemId === itemId && !s.open ? null : s));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const ch = channelRef.current;
      const now = Date.now();
      const current = openRef.current;
      if (current) {
        if (!boardRef.current()?.getGraph?.(current.itemId)) {
          setState((s) => (s && s.target.itemId === current.itemId && !s.erased ? { ...s, erased: true } : s));
        } else if (!sendingRef.current && ch.canReport()) {
          const text = exploreReportDue(current.reporter, now, ch.isQuiet());
          if (text) {
            markExploreSent(current.reporter, text, now);
            void send(current.itemId, text, false, current.reporter);
          }
        }
      }
      const last = finalRef.current;
      if (last && !sendingRef.current) {
        if (ch.isQuiet()) {
          finalRef.current = null;
          void send(last.itemId, last.text, true, null);
        } else if (now > last.until) {
          finalRef.current = null;
          ch.log("report_dropped", { itemId: last.itemId, text: last.text });
        }
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [send]);

  return { state, explorerRef, open, close, change, exited };
}
