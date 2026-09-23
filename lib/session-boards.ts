// One board per problem, for the summary page.
//
// The tutor opens each problem with `start_new_problem`, which carries a
// title and clears the board, and a picture of the board is recorded after
// every drawing. So the story of a session is deterministic: each problem's
// finished board is the last picture taken before the next problem opened.
// Nothing here asks a model. Pure, so it can be tested on synthetic events.

import { compareEvents, type TimelineEvent } from "./session-recording";

/** What the boards route reads from `session_frames`: never the picture itself. */
export type FrameRef = {
  id: number;
  offsetMs: number;
  reason: string;
  width: number;
  height: number;
};

export type ProblemBoard = {
  /** Position in the session, from 1. */
  index: number;
  /** The tutor's own heading for the problem. */
  title: string;
  frameId: number;
  width: number;
  height: number;
  /** When the problem opened, ms into the session. */
  startMs: number;
};

const TITLE_MAX = 80;

/** A worksheet page sent as a picture is not the board. */
function isBoardPicture(frame: FrameRef): boolean {
  return !/^upload/i.test(frame.reason);
}

function problemTitle(payload: Record<string, unknown>, n: number): string {
  const args = payload.args && typeof payload.args === "object" ? (payload.args as Record<string, unknown>) : {};
  const title = typeof args.title === "string" ? args.title.replace(/\s+/g, " ").trim() : "";
  return title ? title.slice(0, TITLE_MAX) : `Problem ${n}`;
}

/**
 * The boards of a session in order. A problem the tutor opened but never
 * drew for (two `start_new_problem` calls in a row) is left out rather than
 * shown as an empty tile. A session with pictures but no problem markers
 * (an older recording) gets its newest picture under the session's title,
 * so the page still has a board to show.
 */
export function problemBoards(events: readonly TimelineEvent[], frames: readonly FrameRef[], fallbackTitle: string): ProblemBoard[] {
  const pictures = frames.filter(isBoardPicture).slice().sort((a, b) => a.offsetMs - b.offsetMs);
  if (pictures.length === 0) return [];

  const starts = events
    .filter((e) => e.kind === "tool.call" && e.payload?.name === "start_new_problem")
    .slice()
    .sort(compareEvents);

  const newest = (list: FrameRef[]) => list[list.length - 1];

  if (starts.length === 0) {
    const last = newest(pictures);
    return [{ index: 1, title: fallbackTitle, frameId: last.id, width: last.width, height: last.height, startMs: 0 }];
  }

  const boards: ProblemBoard[] = [];
  starts.forEach((start, i) => {
    const from = start.offsetMs;
    const until = i + 1 < starts.length ? starts[i + 1].offsetMs : Number.POSITIVE_INFINITY;
    const within = pictures.filter((f) => f.offsetMs >= from && f.offsetMs < until);
    if (within.length === 0) return;
    const last = newest(within);
    boards.push({
      index: boards.length + 1,
      title: problemTitle(start.payload, i + 1),
      frameId: last.id,
      width: last.width,
      height: last.height,
      startMs: from,
    });
  });

  // Every marker came before every picture: an odd recording, but the
  // pictures are still the student's work.
  if (boards.length === 0) {
    const last = newest(pictures);
    return [{ index: 1, title: fallbackTitle, frameId: last.id, width: last.width, height: last.height, startMs: 0 }];
  }
  return boards;
}
