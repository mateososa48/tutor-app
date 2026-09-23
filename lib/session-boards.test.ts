import { test } from "node:test";
import assert from "node:assert/strict";
import { problemBoards, type FrameRef } from "./session-boards";
import type { TimelineEvent } from "./session-recording";

const start = (seq: number, offsetMs: number, title?: string): TimelineEvent => ({
  seq,
  offsetMs,
  kind: "tool.call",
  actor: "tutor",
  payload: { name: "start_new_problem", args: title === undefined ? {} : { title } },
});

const draw = (seq: number, offsetMs: number): TimelineEvent => ({
  seq,
  offsetMs,
  kind: "tool.call",
  actor: "tutor",
  payload: { name: "draw_fraction", args: {} },
});

const frame = (id: number, offsetMs: number, reason = "sent to tutor"): FrameRef => ({ id, offsetMs, reason, width: 896, height: 500 });

test("each problem gets the last picture taken before the next one opened", () => {
  // The shape of the 13-minute homework session: six problems, a picture after every drawing.
  const events = [start(1, 3_000, "Solving 3x + 7 = 25"), draw(2, 10_000), draw(3, 60_000), start(4, 172_000, "Graphing y = 2x + 1"), draw(5, 200_000), start(6, 762_000, "Today's takeaway"), draw(7, 770_000)];
  const frames = [frame(1, 11_000), frame(2, 61_000), frame(3, 201_000), frame(4, 771_000)];
  const boards = problemBoards(events, frames, "Session");
  assert.deepEqual(
    boards.map((b) => [b.index, b.title, b.frameId]),
    [
      [1, "Solving 3x + 7 = 25", 2],
      [2, "Graphing y = 2x + 1", 3],
      [3, "Today's takeaway", 4],
    ],
  );
  assert.equal(boards[0].startMs, 3_000);
  assert.equal(boards[0].width, 896);
});

test("a problem opened and never drawn for is left out, and the numbering closes up", () => {
  const events = [start(1, 1_000, "First try at a title"), start(2, 1_500, "The real title"), draw(3, 2_000)];
  const frames = [frame(1, 3_000)];
  const boards = problemBoards(events, frames, "Session");
  assert.deepEqual(
    boards.map((b) => [b.index, b.title]),
    [[1, "The real title"]],
  );
});

test("a worksheet page sent as a picture is never a board", () => {
  const events = [start(1, 1_000, "Problem 5")];
  const frames = [frame(1, 2_000), frame(2, 3_000, "upload: File 1, page 2")];
  const boards = problemBoards(events, frames, "Session");
  assert.equal(boards.length, 1);
  assert.equal(boards[0].frameId, 1, "the newer upload picture must not win");
});

test("pictures before the first problem opened belong to nobody", () => {
  const events = [start(2, 5_000, "Fractions")];
  const frames = [frame(1, 1_000), frame(2, 9_000)];
  assert.equal(problemBoards(events, frames, "Session")[0].frameId, 2);
});

test("an older recording with pictures but no problem markers still shows its newest board", () => {
  const boards = problemBoards([draw(1, 1_000)], [frame(1, 2_000), frame(2, 4_000)], "my homework");
  assert.deepEqual(
    boards.map((b) => [b.index, b.title, b.frameId]),
    [[1, "my homework", 2]],
  );
});

test("no pictures means no boards, whatever the events say", () => {
  assert.deepEqual(problemBoards([start(1, 1_000, "x")], [], "Session"), []);
  assert.deepEqual(problemBoards([start(1, 1_000, "x")], [frame(1, 2_000, "upload: sheet")], "Session"), []);
});

test("a missing or messy title falls back to the problem's number", () => {
  const events = [start(1, 1_000), start(2, 5_000, "   Long   spaced\n title  ")];
  const frames = [frame(1, 2_000), frame(2, 6_000)];
  const boards = problemBoards(events, frames, "Session");
  assert.equal(boards[0].title, "Problem 1");
  assert.equal(boards[1].title, "Long spaced title");
});

test("markers are read in recording order, not array order", () => {
  const events = [start(3, 9_000, "Second"), start(1, 1_000, "First")];
  const frames = [frame(1, 2_000), frame(2, 10_000)];
  assert.deepEqual(
    problemBoards(events, frames, "Session").map((b) => b.title),
    ["First", "Second"],
  );
});
