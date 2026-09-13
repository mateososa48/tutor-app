import type {
  BoardActionType,
  BoardAgentAction,
  BoardArtifactMeta,
  BoardArtifactOwner,
} from "./board-agent-types";

export type SemanticBoardArtifactKind =
  | "problem"
  | "section"
  | "setup"
  | "equation"
  | "comparison"
  | "area_model"
  | "vector_diagram"
  | "process_map"
  | "text"
  | "graph"
  | "shape"
  | "table"
  | "number_line"
  | "coordinate_axes"
  | "points"
  | "worked_example"
  | "student_attempt"
  | "sticky_note"
  | "scene_text"
  | "scene_shape"
  | "scene_arrow"
  | "stroke"
  | "line"
  | "diagram"
  | "annotation";

export type SemanticBoardBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
  column?: "left" | "right" | "full";
  pageIndex?: number;
};

export type SemanticBoardStyle = {
  color?: string;
  fill?: string;
  font?: string;
  dash?: string;
  size?: string;
  texture?: "none" | "semi" | "solid" | "pattern" | "lined" | "drawn";
  visualRole?: "primary" | "secondary" | "accent" | "warning" | "success" | "structure";
};

export type SemanticBoardRelation = {
  type: "contains" | "labels" | "points_to" | "annotates" | "depends_on" | "replaces";
  targetId: string;
  label?: string;
};

export type SemanticBoardContent = Record<string, string | number | boolean | string[] | undefined>;

export type SemanticBoardArtifact = {
  id: string;
  kind: SemanticBoardArtifactKind;
  actionType?: BoardActionType;
  label: string;
  summary: string;
  owner: BoardArtifactOwner;
  role?: string;
  concept?: string;
  tutorReferenceLabel?: string;
  sourceJobId?: string;
  shapeIds: string[];
  eqItemIds: string[];
  bounds?: SemanticBoardBounds;
  style?: SemanticBoardStyle;
  content?: SemanticBoardContent;
  relations?: SemanticBoardRelation[];
  createdAt: number;
  updatedAt: number;
};

export type SemanticBoard = {
  version: 1;
  title?: string;
  artifacts: SemanticBoardArtifact[];
  lastActionType?: BoardActionType;
  lastJobId?: string;
  updatedAt: number;
};

export type SemanticBoardActionContext = {
  shapeIds?: string[];
  eqItemIds?: string[];
  bounds?: SemanticBoardBounds;
  now?: number;
};

const MAX_SEMANTIC_ARTIFACTS = 140;

const KIND_BY_ACTION: Partial<Record<BoardActionType, SemanticBoardArtifactKind>> = {
  start_new_problem: "problem",
  start_section: "section",
  problem_setup: "setup",
  equation_sequence: "equation",
  two_column_comparison: "comparison",
  area_model: "area_model",
  vector_diagram: "vector_diagram",
  process_map: "process_map",
  text_note: "text",
  function_graph: "graph",
  shape: "shape",
  table: "table",
  number_line: "number_line",
  coordinate_axes: "coordinate_axes",
  plot_points: "points",
  worked_example_box: "worked_example",
  student_attempt: "student_attempt",
  highlight_step: "annotation",
  cross_out_step: "annotation",
  fraction: "diagram",
  figure: "diagram",
  angle: "diagram",
  array: "diagram",
  balance: "diagram",
  bar_chart: "diagram",
  sketch: "diagram",
  freeform_text: "scene_text",
  freeform_shape: "scene_shape",
  freeform_arrow: "scene_arrow",
  freeform_pen: "stroke",
  freeform_draw: "stroke",
  freeform_line: "line",
  freeform_note: "sticky_note",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function shortText(value: string, max = 140): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function firstLine(value?: string): string | undefined {
  const line = value?.split(/\n/).map((item) => item.trim()).find(Boolean);
  return line || undefined;
}

function textureFor(action: BoardAgentAction): SemanticBoardStyle["texture"] {
  if (action.fill === "pattern") return "pattern";
  if (action.fill === "lined-fill") return "lined";
  if (action.fill === "solid" || action.fill === "fill") return "solid";
  if (action.fill === "semi") return "semi";
  if (action.dash === "draw" || action.font === "draw") return "drawn";
  return "none";
}

function visualRoleFor(action: BoardAgentAction): SemanticBoardStyle["visualRole"] {
  if (action.color === "red" || action.color === "light-red") return "warning";
  if (action.color === "green" || action.color === "light-green") return "success";
  if (action.color === "yellow" || action.color === "orange" || action.color === "violet") return "accent";
  if (action.color === "grey" || action.color === "light-blue" || action.color === "light-violet") return "secondary";
  if (action.type === "coordinate_axes" || action.type === "table" || action.type === "number_line") return "structure";
  return "primary";
}

function styleFromAction(action: BoardAgentAction): SemanticBoardStyle | undefined {
  const style: SemanticBoardStyle = {
    color: action.color,
    fill: action.fill,
    font: action.font,
    dash: action.dash,
    size: action.size,
    texture: textureFor(action),
    visualRole: visualRoleFor(action),
  };
  return Object.values(style).some((value) => value !== undefined) ? style : undefined;
}

function boundsFromAction(action: BoardAgentAction): SemanticBoardBounds | undefined {
  if (typeof action.x === "number" && typeof action.y === "number") {
    if (typeof action.x2 === "number" && typeof action.y2 === "number") {
      return {
        x: Math.min(action.x, action.x2),
        y: Math.min(action.y, action.y2),
        w: Math.max(24, Math.abs(action.x2 - action.x)),
        h: Math.max(24, Math.abs(action.y2 - action.y)),
      };
    }
    return {
      x: action.x,
      y: action.y,
      w: action.width ?? (action.type === "freeform_note" ? 220 : 160),
      h: action.height ?? (action.type === "freeform_note" ? 220 : 90),
    };
  }
  if (Array.isArray(action.points) && action.points.length > 0) {
    const minX = Math.min(...action.points.map((point) => point.x));
    const maxX = Math.max(...action.points.map((point) => point.x));
    const minY = Math.min(...action.points.map((point) => point.y));
    const maxY = Math.max(...action.points.map((point) => point.y));
    return { x: minX, y: minY, w: Math.max(24, maxX - minX), h: Math.max(24, maxY - minY) };
  }
  return undefined;
}

function artifactLabel(action: BoardAgentAction): string {
  return (
    action.tutorReferenceLabel ??
    action.label ??
    action.title ??
    firstLine(action.text) ??
    firstLine(action.goal) ??
    firstLine(action.steps) ??
    action.expression ??
    action.center_label ??
    action.type.replaceAll("_", " ")
  );
}

function artifactSummary(action: BoardAgentAction): string {
  if (action.summary?.trim()) return shortText(action.summary);
  switch (action.type) {
    case "start_new_problem":
      return `Problem title: ${action.title ?? "new problem"}.`;
    case "start_section":
      return `Section heading: ${action.title ?? "board section"}.`;
    case "problem_setup":
      return shortText([action.goal, action.givens, action.unknowns, action.plan].filter(Boolean).join(" "));
    case "equation_sequence": {
      const count = action.steps?.split(/\n/).filter((line) => line.trim()).length ?? 0;
      return `${count || 1} equation step${count === 1 ? "" : "s"}${action.title ? ` for ${action.title}` : ""}.`;
    }
    case "function_graph":
      return `Graph of ${action.expression ?? "expression"} on x=[${action.x_min ?? "?"}, ${action.x_max ?? "?"}].`;
    case "number_line": {
      const points = action.text ?? action.points?.map((point) => `${point.x}`).join(", ");
      return `Number line from ${action.min ?? "?"} to ${action.max ?? "?"}${points ? ` with ${shortText(points, 60)}` : ""}.`;
    }
    case "coordinate_axes":
      return `Coordinate plane x=[${action.x_min ?? "?"}, ${action.x_max ?? "?"}], y=[${action.y_min ?? "?"}, ${action.y_max ?? "?"}].`;
    case "plot_points":
      return `Plotted points: ${shortText(action.text ?? action.points?.map((point) => `(${point.x},${point.y})`).join("; ") ?? "", 90)}.`;
    case "freeform_arrow":
      return `Arrow from (${Math.round(action.x ?? 0)}, ${Math.round(action.y ?? 0)}) to (${Math.round(action.x2 ?? 0)}, ${Math.round(action.y2 ?? 0)}).`;
    case "freeform_shape":
      return `${action.shape ?? "shape"} scene element${action.color ? ` in ${action.color}` : ""}.`;
    case "freeform_note":
      return `Sticky note: ${shortText(action.text ?? action.label ?? "")}`;
    case "highlight_step":
      return `Highlighted equation step ${action.step_label ?? action.step_index ?? ""}.`;
    case "cross_out_step":
      return `Crossed out equation step ${action.step_label ?? action.step_index ?? ""}.`;
    default:
      return shortText(
        action.text ??
        action.body ??
        action.label ??
        action.title ??
        action.type.replaceAll("_", " "),
      );
  }
}

function artifactContent(action: BoardAgentAction): SemanticBoardContent {
  const content: SemanticBoardContent = {};
  for (const [key, value] of Object.entries(action)) {
    if (
      key === "type" ||
      key === "role" ||
      key === "concept" ||
      key === "summary" ||
      key === "owner" ||
      key === "tutorReferenceLabel"
    ) {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      content[key] = value;
    }
  }
  if (action.points?.length) {
    content.points = action.points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`);
  }
  return content;
}

function semanticId(
  action: BoardAgentAction,
  meta: BoardArtifactMeta,
  context: SemanticBoardActionContext,
  now: number,
): string {
  const firstEq = context.eqItemIds?.[0];
  if (firstEq) return `semantic:eq:${firstEq}`;
  const firstShape = context.shapeIds?.[0];
  if (firstShape) return `semantic:${firstShape}`;
  const job = meta.jobId || "direct";
  const label = artifactLabel(action).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `semantic:${job}:${action.type}:${label || now}`;
}

function normalizeBounds(value: unknown): SemanticBoardBounds | undefined {
  const raw = asRecord(value);
  const x = asNumber(raw.x);
  const y = asNumber(raw.y);
  const w = asNumber(raw.w);
  const h = asNumber(raw.h);
  if (x === undefined || y === undefined || w === undefined || h === undefined) return undefined;
  const column = asString(raw.column) as SemanticBoardBounds["column"];
  return {
    x,
    y,
    w,
    h,
    column: column === "left" || column === "right" || column === "full" ? column : undefined,
    pageIndex: asNumber(raw.pageIndex),
  };
}

function normalizeArtifact(value: unknown): SemanticBoardArtifact | null {
  const raw = asRecord(value);
  const id = asString(raw.id);
  const kind = asString(raw.kind) as SemanticBoardArtifactKind;
  const label = asString(raw.label);
  if (!id || !kind || !label) return null;
  const owner = asString(raw.owner) as BoardArtifactOwner;
  const styleRaw = asRecord(raw.style);
  const contentRaw = asRecord(raw.content);
  return {
    id,
    kind,
    actionType: asString(raw.actionType) as BoardActionType || undefined,
    label,
    summary: asString(raw.summary, label),
    owner: owner === "student" || owner === "tutor" || owner === "board-agent" ? owner : "board-agent",
    role: asString(raw.role) || undefined,
    concept: asString(raw.concept) || undefined,
    tutorReferenceLabel: asString(raw.tutorReferenceLabel) || undefined,
    sourceJobId: asString(raw.sourceJobId) || undefined,
    shapeIds: asStringArray(raw.shapeIds),
    eqItemIds: asStringArray(raw.eqItemIds),
    bounds: normalizeBounds(raw.bounds),
    style: Object.keys(styleRaw).length > 0 ? {
      color: asString(styleRaw.color) || undefined,
      fill: asString(styleRaw.fill) || undefined,
      font: asString(styleRaw.font) || undefined,
      dash: asString(styleRaw.dash) || undefined,
      size: asString(styleRaw.size) || undefined,
      texture: asString(styleRaw.texture) as SemanticBoardStyle["texture"] || undefined,
      visualRole: asString(styleRaw.visualRole) as SemanticBoardStyle["visualRole"] || undefined,
    } : undefined,
    content: Object.keys(contentRaw).length > 0
      ? Object.fromEntries(
        Object.entries(contentRaw).filter(([, item]) =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean" ||
          Array.isArray(item)
        ),
      ) as SemanticBoardContent
      : undefined,
    relations: Array.isArray(raw.relations)
      ? raw.relations.map((item): SemanticBoardRelation | null => {
        const relation = asRecord(item);
        const type = asString(relation.type) as SemanticBoardRelation["type"];
        const targetId = asString(relation.targetId);
        if (!targetId) return null;
        const normalized: SemanticBoardRelation = {
          type,
          targetId,
          label: asString(relation.label) || undefined,
        };
        return normalized;
      }).filter((item): item is SemanticBoardRelation => item !== null)
      : undefined,
    createdAt: asNumber(raw.createdAt) ?? Date.now(),
    updatedAt: asNumber(raw.updatedAt) ?? Date.now(),
  };
}

export function createEmptySemanticBoard(title?: string): SemanticBoard {
  return {
    version: 1,
    title,
    artifacts: [],
    updatedAt: Date.now(),
  };
}

export function normalizeSemanticBoard(value: unknown): SemanticBoard {
  const raw = asRecord(value);
  const artifacts = Array.isArray(raw.artifacts)
    ? raw.artifacts.map(normalizeArtifact).filter((item): item is SemanticBoardArtifact => Boolean(item))
    : [];
  return {
    version: 1,
    title: asString(raw.title) || undefined,
    artifacts: artifacts.slice(-MAX_SEMANTIC_ARTIFACTS),
    lastActionType: asString(raw.lastActionType) as BoardActionType || undefined,
    lastJobId: asString(raw.lastJobId) || undefined,
    updatedAt: asNumber(raw.updatedAt) ?? Date.now(),
  };
}

function createArtifact(
  action: BoardAgentAction,
  meta: BoardArtifactMeta,
  context: SemanticBoardActionContext,
  now: number,
): SemanticBoardArtifact {
  const shapeIds = context.shapeIds ?? [];
  const eqItemIds = context.eqItemIds ?? [];
  return {
    id: semanticId(action, meta, context, now),
    kind: KIND_BY_ACTION[action.type] ?? "annotation",
    actionType: action.type,
    label: artifactLabel(action),
    summary: artifactSummary(action),
    owner: action.owner ?? meta.owner ?? "board-agent",
    role: action.role ?? meta.role,
    concept: action.concept ?? meta.concept,
    tutorReferenceLabel: action.tutorReferenceLabel ?? action.label ?? action.title ?? meta.tutorReferenceLabel,
    sourceJobId: meta.jobId,
    shapeIds,
    eqItemIds,
    bounds: context.bounds ?? boundsFromAction(action),
    style: styleFromAction(action),
    content: artifactContent(action),
    createdAt: now,
    updatedAt: now,
  };
}

function upsertArtifact(board: SemanticBoard, artifact: SemanticBoardArtifact): SemanticBoard {
  const nextArtifacts = board.artifacts.some((item) => item.id === artifact.id)
    ? board.artifacts.map((item) => item.id === artifact.id ? { ...item, ...artifact, createdAt: item.createdAt } : item)
    : [...board.artifacts, artifact];
  return {
    ...board,
    artifacts: nextArtifacts.slice(-MAX_SEMANTIC_ARTIFACTS),
    updatedAt: artifact.updatedAt,
    lastActionType: artifact.actionType,
    lastJobId: artifact.sourceJobId,
  };
}

function targetIds(action: BoardAgentAction): Set<string> {
  return new Set([
    ...(action.target_ids ?? []),
    ...(action.target_id ? [action.target_id] : []),
  ]);
}

function touchesTarget(artifact: SemanticBoardArtifact, targets: Set<string>): boolean {
  if (targets.size === 0) return false;
  return artifact.shapeIds.some((id) => targets.has(id)) || artifact.eqItemIds.some((id) => targets.has(id));
}

export function applySemanticBoardAction(
  boardInput: SemanticBoard,
  action: BoardAgentAction,
  meta: BoardArtifactMeta,
  context: SemanticBoardActionContext = {},
): SemanticBoard {
  const now = context.now ?? Date.now();
  const board = normalizeSemanticBoard(boardInput);

  if (action.type === "clear_board") {
    return createEmptySemanticBoard();
  }

  if (action.type === "start_new_problem") {
    const empty = createEmptySemanticBoard(action.title ?? action.text ?? "New problem");
    return upsertArtifact(empty, createArtifact(action, meta, context, now));
  }

  if (action.type === "delete_shape") {
    const targets = targetIds(action);
    return {
      ...board,
      artifacts: board.artifacts.filter((artifact) => !touchesTarget(artifact, targets)),
      lastActionType: action.type,
      lastJobId: meta.jobId,
      updatedAt: now,
    };
  }

  if (action.type === "move_shape") {
    const targets = targetIds(action);
    const dx = action.dx ?? 0;
    const dy = action.dy ?? 0;
    return {
      ...board,
      artifacts: board.artifacts.map((artifact) => {
        if (!touchesTarget(artifact, targets) || !artifact.bounds) return artifact;
        return {
          ...artifact,
          bounds: { ...artifact.bounds, x: artifact.bounds.x + dx, y: artifact.bounds.y + dy },
          updatedAt: now,
        };
      }),
      lastActionType: action.type,
      lastJobId: meta.jobId,
      updatedAt: now,
    };
  }

  if (action.type === "update_text") {
    const targets = targetIds(action);
    const text = action.text ?? action.label;
    return {
      ...board,
      artifacts: board.artifacts.map((artifact) => {
        if (!touchesTarget(artifact, targets) || !text) return artifact;
        return {
          ...artifact,
          label: shortText(text, 80),
          summary: `Updated text: ${shortText(text)}`,
          content: { ...(artifact.content ?? {}), text },
          updatedAt: now,
        };
      }),
      lastActionType: action.type,
      lastJobId: meta.jobId,
      updatedAt: now,
    };
  }

  if (action.type === "align_shapes") {
    return {
      ...board,
      lastActionType: action.type,
      lastJobId: meta.jobId,
      updatedAt: now,
    };
  }

  return upsertArtifact(board, createArtifact(action, meta, context, now));
}

export function summarizeSemanticBoard(boardInput: unknown): string {
  const board = normalizeSemanticBoard(boardInput);
  if (board.artifacts.length === 0) return "Semantic board is empty.";

  const counts = new Map<SemanticBoardArtifactKind, number>();
  for (const artifact of board.artifacts) {
    counts.set(artifact.kind, (counts.get(artifact.kind) ?? 0) + 1);
  }
  const countText = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([kind, count]) => `${count} ${kind.replaceAll("_", " ")}`)
    .join(", ");
  const recent = board.artifacts
    .slice(-5)
    .map((artifact) => artifact.tutorReferenceLabel ?? artifact.label)
    .filter(Boolean)
    .join("; ");
  return [
    board.title ? `Title: ${board.title}.` : "",
    `Semantic artifacts: ${board.artifacts.length}${countText ? ` (${countText})` : ""}.`,
    recent ? `Recent focus: ${recent}.` : "",
  ].filter(Boolean).join(" ");
}

export function semanticBoardToPromptLines(boardInput: unknown, limit = 18): string[] {
  const board = normalizeSemanticBoard(boardInput);
  return board.artifacts.slice(-limit).map((artifact) => {
    const bounds = artifact.bounds
      ? ` bounds=${Math.round(artifact.bounds.x)},${Math.round(artifact.bounds.y)},${Math.round(artifact.bounds.w)}x${Math.round(artifact.bounds.h)}`
      : "";
    const style = artifact.style
      ? ` style=${[
        artifact.style.color,
        artifact.style.fill,
        artifact.style.font,
        artifact.style.dash,
        artifact.style.size,
        artifact.style.texture,
      ].filter(Boolean).join("/")}`
      : "";
    const refs = [
      artifact.shapeIds.length ? `shapes=${artifact.shapeIds.slice(0, 4).join(",")}` : "",
      artifact.eqItemIds.length ? `eq=${artifact.eqItemIds.slice(0, 4).join(",")}` : "",
    ].filter(Boolean).join(" ");
    return [
      `${artifact.id} ${artifact.kind}`,
      `label="${artifact.tutorReferenceLabel ?? artifact.label}"`,
      `owner=${artifact.owner}`,
      artifact.concept ? `concept=${artifact.concept}` : "",
      bounds,
      style,
      refs,
      `summary="${shortText(artifact.summary, 180)}"`,
    ].filter(Boolean).join(" ");
  });
}
