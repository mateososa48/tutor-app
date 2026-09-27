import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLiveInstructions } from "./tutor-prompts-live";
import { liveToolDeclarations } from "./gemini-live";
import { intakeInstructions } from "./session-intake";
import type { StudentProfile } from "./tutor-prompts";

const PROFILE: StudentProfile = { displayName: "Sofia", gradeLevel: "7th grade", learningPrefs: {} };

test("the Live prompt is a third of the old one and names only tools a Live session declares", () => {
  const text = buildLiveInstructions(PROFILE, ["mixes up numerator and denominator"], { desmos: true });
  // The old Gemini prompt measured 20,662 (Sept 25 2026); 3.8 skims a rulebook.
  assert.ok(text.length < 9000, `Live prompt is ${text.length} characters`);
  const declared = new Set(liveToolDeclarations().map((d) => d.name));
  const named = new Set([...text.matchAll(/\b([a-z]+(?:_[a-z]+)+)\b/g)].map((m) => m[1]).filter((n) => /^(add|draw|start|set|point|circle|cross|erase|look|remember|check|highlight)_/.test(n)));
  for (const n of named) assert.ok(declared.has(n), `${n} is named in the Live prompt but not declared to a Live session`);
  for (const must of ["# Who you are", "# How you talk", "# How a turn goes", "# The lesson", "# What draws what", "# Boundaries", "# This student", "# Three turns", "# Now you're live"]) assert.ok(text.includes(must), must);
  // 3.8 ends a generation at a drawing call made before any speech, so the
  // voice comes first and only the blocking check may precede it (Sept 26 2026).
  assert.match(text, /Your voice comes first/);
  assert.match(text, /say your whole reply, ending with the one thing they do next, then draw and mark/);
  assert.match(text, /When they gave an answer, call check_answer first, before any words/);
  assert.match(text, /Never check after you've spoken/);
  assert.doesNotMatch(text, /name the move to yourself/, "no self-talk: 3.8 speaks what it plans");
  assert.match(text, /A bare number is an answer: reply to it/);
  assert.match(text, /never a tool's name or arguments, never LaTeX/);
  assert.match(text, /Draw the thing the math is about before you explain it/);
  assert.match(text, /Tool results report what happened/);
  assert.doesNotMatch(text, /A tool result is an order/);
  // Every example turn speaks before it draws: a drawing call may follow words or check_answer, never open the turn.
  for (const line of text.split("\n").filter((l) => l.startsWith("Return: "))) {
    const first = line.slice("Return: ".length).split(" · ")[0];
    assert.ok(first.startsWith('"') || first.startsWith("check_answer("), `example opens with ${first.slice(0, 30)}`);
    // …and says the whole reply in one piece: a call mid-reply ends 3.8's generation.
    const spoken = line.slice("Return: ".length).split(" · ").filter((p) => p.startsWith('"'));
    assert.ok(spoken.length <= 1, `example splits its reply around a call: ${line.slice(0, 60)}`);
  }
  assert.match(text, /If they've already said their idea/);
  assert.match(text, /named Sofia/);
  assert.match(text, /mixes up numerator and denominator/);
  assert.doesNotMatch(text, /# Backchannel policy|# Delegation policy|area between curves/);
});

test("the Live prompt takes the session block and routes graphs by Desmos", () => {
  const session = intakeInstructions({ topic: "decimals", language: "en", fileNames: [], minutes: 15 }, 0);
  const withSession = buildLiveInstructions(PROFILE, [], { desmos: true, session });
  assert.ok(withSession.includes("# This session"));
  assert.ok(withSession.indexOf("# This session") < withSession.indexOf("# Now you're live"), "the session block sits before the closing line");
  assert.match(buildLiveInstructions(PROFILE, [], { desmos: true }), /draw_desmos/);
  const noDesmos = buildLiveInstructions(PROFILE, [], { desmos: false });
  assert.doesNotMatch(noDesmos, /draw_desmos/);
  assert.match(noDesmos, /add_function_graph/);
});
