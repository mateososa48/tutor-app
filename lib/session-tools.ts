// Tools about the session rather than the board (Sept 16 2026).
//   look_at_worksheet — shows the model one page of an uploaded file again.
// A recorded session opened "Problem 8" when the student said "let's do part
// c": uploads were sent once at the start, so the model worked from memory of
// a picture it could no longer see. The live client answers this tool by
// sending the page as a picture before the tool result.

import type { OpenAIFunctionTool } from "./whiteboard-tools";

export const SESSION_TOOL_DECLARATIONS = [
  {
    name: "look_at_worksheet",
    description:
      "Look at the student's uploaded work again: shows you one page as a fresh picture. Call it whenever they name a problem or a part ('number 4', 'part c'), and before you copy a problem onto the board, so you copy it exactly.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Optional: 'File 1', or words from the file name. Default: the file you looked at last, else the newest." },
        page: { type: "number", description: "Optional: the page, from 1. Default: the page you looked at last, else 1." },
      },
      required: [],
    },
  },
];

export const SESSION_TOOL_NAMES: ReadonlySet<string> = new Set(SESSION_TOOL_DECLARATIONS.map((d) => d.name));

export const SESSION_FUNCTION_TOOLS: OpenAIFunctionTool[] = SESSION_TOOL_DECLARATIONS.map((decl) => ({
  type: "function",
  name: decl.name,
  description: decl.description,
  parameters: decl.parameters as Record<string, unknown>,
  strict: false,
}));

export type WorksheetFile = { id: string; label: string; name: string; mimeType: string; pages: number };
export type WorksheetLook = { fileId: string; page: number };
export type WorksheetChoice = { file: WorksheetFile; page: number } | { error: string };

const VIEWABLE = /^(image\/(jpeg|png)|application\/pdf)$/;

/** Which file and page look_at_worksheet means. Pure. */
export function resolveWorksheet(files: WorksheetFile[], args: Record<string, unknown>, last?: WorksheetLook | null): WorksheetChoice {
  const viewable = files.filter((f) => VIEWABLE.test(f.mimeType));
  if (viewable.length === 0) {
    return {
      error: files.length > 0
        ? "The uploaded files are text, and their words are already in the conversation. Nothing to look at."
        : "No worksheet was uploaded in this session. If the student has one, ask them to add a photo or PDF with the Files button.",
    };
  }
  const wanted = typeof args.file === "string" ? args.file.trim().toLowerCase() : "";
  let file: WorksheetFile | undefined;
  if (wanted) {
    const number = /^(?:file\s*)?(\d+)$/.exec(wanted)?.[1];
    file = number
      ? viewable.find((f) => f.label.toLowerCase() === `file ${number}`)
      : viewable.find((f) => f.label.toLowerCase() === wanted) ??
        viewable.find((f) => f.name.toLowerCase().includes(wanted)) ??
        viewable.find((f) => wanted.split(/\s+/).every((w) => f.name.toLowerCase().includes(w)));
    if (!file) return { error: `No uploaded file matches "${args.file}". Files: ${viewable.map((f) => `${f.label} "${f.name}"`).join(", ")}.` };
  } else {
    file = (last && viewable.find((f) => f.id === last.fileId)) || viewable[viewable.length - 1];
  }
  const pageArg = typeof args.page === "number" && Number.isFinite(args.page) ? Math.round(args.page) : null;
  const page = pageArg ?? (last && last.fileId === file.id ? last.page : 1);
  if (page < 1 || page > file.pages) {
    return { error: `${file.label} "${file.name}" has ${file.pages} page${file.pages === 1 ? "" : "s"}; ask for a page from 1 to ${file.pages}.` };
  }
  return { file, page };
}

/** The tool result once the page has been sent. */
export function worksheetShown(file: WorksheetFile, page: number): string {
  const where = file.pages > 1 ? `, page ${page} of ${file.pages}` : "";
  return `Here is ${file.label} "${file.name}"${where}: the picture arrived just before this. Copy the problem exactly as printed before you work on it.`;
}
