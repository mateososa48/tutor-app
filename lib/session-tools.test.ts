import { test } from "node:test";
import assert from "node:assert/strict";
import { SESSION_FUNCTION_TOOLS, SESSION_TOOL_NAMES, resolveWorksheet, worksheetShown, type WorksheetFile } from "./session-tools";
import { TUTOR_TOOL_NAMES } from "./tutor-tools";
import { WHITEBOARD_TOOL_DECLARATIONS } from "./whiteboard-tools";

const files: WorksheetFile[] = [
  { id: "a", label: "File 1", name: "unit 3 worksheet.pdf", mimeType: "application/pdf", pages: 3 },
  { id: "b", label: "File 2", name: "photo.jpg", mimeType: "image/jpeg", pages: 1 },
  { id: "c", label: "File 3", name: "notes.txt", mimeType: "text/plain", pages: 1 },
];

test("session tools are separate from board and tutor tools", () => {
  const board = new Set(WHITEBOARD_TOOL_DECLARATIONS.map((d) => d.name));
  for (const name of SESSION_TOOL_NAMES) {
    assert.ok(!board.has(name) && !TUTOR_TOOL_NAMES.has(name), name);
  }
  assert.ok(SESSION_FUNCTION_TOOLS.every((t) => t.type === "function" && t.strict === false));
});

test("look_at_worksheet finds the file and page the tutor means", () => {
  const pick = (args: Record<string, unknown>, last?: { fileId: string; page: number }) => {
    const r = resolveWorksheet(files, args, last);
    return "error" in r ? r.error : `${r.file.label} p${r.page}`;
  };
  assert.equal(pick({}), "File 2 p1", "the newest viewable file by default");
  assert.equal(pick({}, { fileId: "a", page: 2 }), "File 1 p2", "then the page looked at last");
  assert.equal(pick({ file: "File 1", page: 3 }), "File 1 p3");
  assert.equal(pick({ file: "1" }), "File 1 p1");
  assert.equal(pick({ file: "worksheet" }), "File 1 p1");
  assert.equal(pick({ file: "unit 3" }), "File 1 p1");
  assert.match(pick({ file: "File 1", page: 4 }), /has 3 pages/);
  assert.match(pick({ file: "File 9" }), /No uploaded file matches/);
  assert.match(pick({ file: "notes" }), /No uploaded file matches/, "text files are not pictures");
  const none = resolveWorksheet([], {});
  assert.ok("error" in none && /No worksheet was uploaded/.test(none.error));
  assert.match(worksheetShown(files[0], 2), /File 1 "unit 3 worksheet.pdf", page 2 of 3/);
});
