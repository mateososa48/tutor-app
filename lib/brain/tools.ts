// The board tools the brain may call (the LiveKit voice path): the Live set's
// whiteboard tools and illustrate, each description its first sentence and
// without `place` (as lib/gemini-live liveToolDeclarations sends them).
// check_answer is declared but is not a board tool: the app checks every
// answer it can read before the brain runs and puts the verdict in the note;
// when it could not, the brain calls check_answer before speaking (turn.ts). look_at_board and look_at_worksheet are
// not either: the note carries the board, and an attached worksheet rides in
// the opening message.
import { liveWhiteboardDeclarations, type ToolDeclaration } from "../whiteboard-tools";
import { ILLUSTRATE_DECLARATION } from "../illustration/tool";
import { TUTOR_TOOL_DECLARATIONS } from "../tutor-tools";

function slim(decl: ToolDeclaration): ToolDeclaration {
  const { place: _place, ...properties } = decl.parameters.properties ?? {};
  void _place;
  return { ...decl, description: decl.description.split(/(?<=[.!?])\s+(?=[A-Z'"(])/)[0].trim(), parameters: { ...decl.parameters, properties } };
}

export function brainToolDeclarations(): ToolDeclaration[] {
  const check = TUTOR_TOOL_DECLARATIONS.find((d) => d.name === "check_answer") as ToolDeclaration;
  return [check, ...liveWhiteboardDeclarations(), ILLUSTRATE_DECLARATION].map(slim);
}

/** Board tools the brain may call; anything else it emits is dropped before it reaches the board. */
export function brainToolNames(): Set<string> {
  return new Set(brainToolDeclarations().map((d) => d.name).filter((n) => n !== "check_answer"));
}
