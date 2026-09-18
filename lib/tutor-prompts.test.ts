import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBackendInstructions,
  buildFilesItemText,
  buildGeminiInstructions,
  buildGreetingLine,
  buildResumeLine,
  buildVoiceInstructions,
  profileLines,
  registerForGrade,
} from "./tutor-prompts";

const profile = {
  displayName: "Sofia Ramirez",
  gradeLevel: "Middle school (6–8)",
  learningPrefs: { hintVsAnswer: -1, pace: -1, examplesVsTheory: -1, tone: 1 },
  extraContext: "Struggles with fractions.",
};

test("voice instructions stay short, name the student, and keep turn-taking rules", () => {
  const text = buildVoiceInstructions(profile);
  assert.ok(text.length < 5000, `voice prompt too long: ${text.length}`);
  assert.match(text, /named Sofia/);
  assert.match(text, /Delegate when:/);
  assert.match(text, /Do not delegate when:/);
  assert.match(text, /still mid-thought/);
  assert.match(text, /# Backchannel policy/);
  assert.match(text, /# Interruption policy/);
  assert.doesNotMatch(text, /Sofia Ramirez/);
});

test("backend instructions carry the profile, memory notes, and the output contract", () => {
  const text = buildBackendInstructions(profile, ["confuses kinetic with momentum"]);
  assert.match(text, /Name: Sofia Ramirez/);
  assert.match(text, /Struggles with fractions/);
  assert.match(text, /- confuses kinetic with momentum/);
  assert.match(text, /Output contract/);
  assert.match(text, /\[Board: …\]/);
  // The teaching sections (Sept 2026) added ~1.5k chars on purpose; keep a ceiling.
  // Raised to 19.2k on Sept 15 for the three board rules (draw the topic, never
  // mention undrawn board content, words are labels), which cost 268 chars net
  // after trimming the lines they replaced. Raise it again only for a rule that
  // earns it, never to make room for prose.
  // Raised to 19.6k on Sept 17 (18,810 → 19,574) for what recorded sessions
  // showed missing: rule 4 (what you work out goes on the board, a right
  // answer is ringed), "what?" and "I don't know" never answered by the tutor
  // itself, looking at the worksheet before copying from it, one sky pen,
  // Desmos routing and a "what?" example; paid down by trimming the board
  // intro, concrete-to-abstract, the [Board] rule and a fallback line.
  // Explore (Sept 17): "ask them to drag it in Explore" (+32), paid for by
  // "Four rules that override the rest" (-12): 19,594, six under the ceiling.
  assert.ok(text.length < 19600, `backend prompt too long: ${text.length}`);
  // Gemini gets the conversation sections too (20,692 on Sept 17).
  const gemini = buildGeminiInstructions(profile, ["mixes up numerator and denominator"]);
  assert.ok(gemini.length < 20800, `gemini prompt too long: ${gemini.length}`);
});

test("what recorded sessions got wrong is now a rule", () => {
  const text = buildBackendInstructions(null, []);
  assert.match(text, /4\. What you work out goes on the board in the same reply/);
  assert.match(text, /their right answer ringed \(circle_item keep=true\)/);
  assert.match(text, /never answer your own question/);
  assert.match(text, /"What\?" usually means they lost the question/);
  assert.doesNotMatch(text, /Never end on "I don't know"/);
  assert.match(text, /respect that and close warmly/i);
  assert.match(text, /look_at_worksheet first, then copy the problem exactly as printed/);
  assert.match(text, /add_student_attempt with their exact words \(not "I don't know"\)/);
  assert.match(text, /every mark is your one sky pen/);
  assert.match(text, /praise and chat are said, not written/);
  assert.match(text, /Example 9 — "what\?"/);
});

test("prompt records assistance honestly and treats learner evidence as a soft brief", () => {
  const brief = "[Learner evidence: Slope: spaced review due. Follow the student's explicit goal.]";
  for (const text of [
    buildBackendInstructions(null, [], { learnerBrief: brief }),
    buildGeminiInstructions(null, [], { learnerBrief: brief }),
  ]) {
    assert.match(text, /record_teaching_move/);
    assert.match(text, /Never call helped work H0/);
    assert.match(text, /Follow the student's explicit goal/);
    assert.match(text, /Slope: spaced review due/);
    for (const call of text.matchAll(/check_answer\(([^)]*)\)/g)) {
      assert.match(call[1], /help_level="H[0-5]"/, `missing help level in ${call[0]}`);
    }
  }
});

test("routing sends anything on axes to Desmos only where Desmos can draw", () => {
  assert.match(buildBackendInstructions(profile, [], { desmos: true }), /drag it in Explore/);
  assert.doesNotMatch(buildBackendInstructions(profile, [], { desmos: false }), /Explore/);
  const withDesmos = buildGeminiInstructions(null, [], { desmos: true });
  assert.match(withDesmos, /Anything on a coordinate plane is drawn by Desmos/);
  assert.match(withDesmos, /draw_desmos \(expressions, points, polygons; sliders/);
  assert.match(withDesmos, /Data: draw_data_plot/);
  assert.match(withDesmos, /grid=true to count squares/);
  assert.match(withDesmos, /draw_desmos\(expressions="y=2x\+1; y=-x\+7"/);
  for (const text of [buildGeminiInstructions(null, [], { desmos: false }), buildBackendInstructions(null, [], { desmos: false })]) {
    assert.doesNotMatch(text, /draw_desmos|draw_data_plot|grid=true/);
    assert.match(text, /add_function_graph \(slope_run, mark_points, second_expression, extra_expressions\)/);
    assert.match(text, /draw_equation_step\(latex="5x \+ 2 = 3x \+ 10"\)/);
  }
});

test("backend instructions teach before they draw", () => {
  const text = buildBackendInstructions(null, []);
  for (const heading of ["# How every turn works", "# Reading the student's answer", "# How much help", "# Feedback and praise", "# Adapting up and down", "# The session", "# When they want the answer"]) {
    assert.ok(text.includes(heading), `missing ${heading}`);
  }
  assert.ok(text.indexOf("# Reading the student's answer") < text.indexOf("# The whiteboard"), "teaching comes before the board section");
  assert.match(text, /H5 Worked example/);
  assert.match(text, /Never call a wrong answer right/);
  assert.doesNotMatch(text, /EVERY reply includes at least one board action/);
  assert.doesNotMatch(text, /Start as high on the ladder as you can/);
});

test("backend instructions still name the picture tools and board rules", () => {
  const text = buildBackendInstructions(null, []);
  assert.match(text, /draw_fraction/);
  assert.match(text, /draw_balance/);
  assert.match(text, /never fake a diagram with text, brackets, dashes, or ASCII/);
  assert.match(text, /never a bare question with an empty board/i);
  assert.match(text, /point_at/);
  assert.match(text, /erase_older/);
  assert.match(text, /never more than four/);
  assert.ok(text.indexOf("Example 1") < text.indexOf('draw_fraction(fraction="1/2"'), "the first example shows the picture being drawn");
});

test("examples vary their openers so the model does not copy one", () => {
  const text = buildBackendInstructions(null, []);
  const returns = [...text.matchAll(/^Return: "([^"]+)"/gm)].map((m) => m[1].split(/[\s,.:]/)[0].toLowerCase());
  assert.ok(returns.length >= 8, `expected at least 8 example replies, got ${returns.length}`);
  assert.equal(new Set(returns).size, returns.length, `repeated openers: ${returns.join(", ")}`);
  assert.doesNotMatch(text, /Totally fair/);
});

test("gemini instructions keep the conversation rules and the teaching rules", () => {
  const text = buildGeminiInstructions(profile, ["mixes up numerator and denominator"]);
  assert.match(text, /named Sofia/);
  assert.match(text, /# Backchannel policy/);
  assert.match(text, /# Interruption policy/);
  assert.match(text, /# Boundaries/);
  assert.match(text, /# How much help/);
  assert.match(text, /# The whiteboard/);
  assert.match(text, /- mixes up numerator and denominator/);
  assert.match(text, /write and draw on it with your tools/);
  assert.doesNotMatch(text, /# Delegation policy/);
  assert.doesNotMatch(text, /The backend's replies are your own thoughts/);
  assert.doesNotMatch(text, /teaching brain \(the backend\) writes/);
});

test("answers are checked by a tool, which records the attempt", () => {
  const text = buildBackendInstructions(null, []);
  assert.match(text, /call check_answer before you call it right or wrong/);
  assert.match(text, /it records the attempt/);
  assert.doesNotMatch(text, /record_attempt/);
  assert.match(text, /\[Tutor state\] line in tool results/);
  assert.match(text, /check_answer\(problem="1\/2 \+ 1\/3", student_answer="2\/5", skill="adding fractions with unlike denominators", help_level="H0", kind="misconception"\)/);
});

test("backend instructions handle a missing profile and empty memory", () => {
  const text = buildBackendInstructions(null, []);
  assert.match(text, /No profile yet/);
  assert.match(text, /nothing yet/);
});

test("stated preferences are soft and only listed when set", () => {
  assert.match(profileLines(profile).join("\n"), /Stated preferences \(a soft default/);
  const neutral = profileLines({ displayName: "Ana", learningPrefs: { hintVsAnswer: 0, pace: 0 } }).join("\n");
  assert.doesNotMatch(neutral, /Stated preferences/);
});

test("opening lines are short, speakable, and name the student", () => {
  assert.equal(buildGreetingLine(profile, 0), "Hi Sofia! Good to see you. What would you like to work on today?");
  assert.match(buildGreetingLine(profile, 2), /the 2 files you attached/);
  assert.match(buildGreetingLine(null, 1), /^Hi! .*the file you attached/);
  assert.match(buildResumeLine(profile), /Sofia, I'm back/);
  assert.match(buildFilesItemText(["File 1 (hw.png)"]), /File 1/);
  assert.ok(buildFilesItemText(["a", "b"]).length < 1500);
});

test("register scales with grade", () => {
  assert.match(registerForGrade("3rd grade"), /Very short/);
  assert.match(registerForGrade("Middle school (6–8)"), /Short plain/);
  assert.match(registerForGrade("High school (9-12)"), /brisker/);
  assert.match(registerForGrade("College / University"), /Precise/);
  assert.match(registerForGrade(null), /Plain, concrete/);
});
