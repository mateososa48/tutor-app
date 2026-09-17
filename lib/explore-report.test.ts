import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPLORE_GAP_MS,
  EXPLORE_QUIET_MS,
  createExploreReporter,
  exploreEventText,
  exploreReportDue,
  finalExploreReport,
  markExploreSent,
  noteExploreChange,
} from "./explore-report";

test("a report waits for the student to stop, for quiet, and for the gap", () => {
  const r = createExploreReporter(0);
  assert.equal(exploreReportDue(r, 10_000, true), null, "nothing changed yet");
  noteExploreChange(r, "moved m from 1 to 2", 1000);
  assert.equal(exploreReportDue(r, 1000 + EXPLORE_QUIET_MS - 1, true), null, "still dragging");
  assert.equal(exploreReportDue(r, 1000 + EXPLORE_QUIET_MS, false), null, "someone is talking");
  const text = exploreReportDue(r, 1000 + EXPLORE_QUIET_MS, true);
  assert.equal(text, "moved m from 1 to 2");
  markExploreSent(r, text as string, 3500);
  assert.equal(exploreReportDue(r, 20_000, true), null, "already said");
  noteExploreChange(r, "moved m from 1 to 3", 4000);
  assert.equal(exploreReportDue(r, 4000 + EXPLORE_QUIET_MS, true), null, "too soon after the last report");
  assert.equal(exploreReportDue(r, 3500 + EXPLORE_GAP_MS, true), "moved m from 1 to 3");
});

test("closing sends only what the tutor has not heard", () => {
  const r = createExploreReporter(0);
  assert.equal(finalExploreReport(r), null);
  noteExploreChange(r, "added y = 3x", 100);
  assert.equal(finalExploreReport(r), "added y = 3x");
  markExploreSent(r, "added y = 3x", 200);
  assert.equal(finalExploreReport(r), null);
  assert.match(exploreEventText("b4", "added y = 3x", true), /^\[Explore b4: the student added y = 3x\. They closed Explore/);
  assert.match(exploreEventText("b4", "moved m", false), /still exploring; a picture of their graph came with this/);
});
