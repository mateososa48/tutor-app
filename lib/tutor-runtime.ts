import { problemFingerprint, type LearningAttemptEvidence } from "./learning-evidence";
import { resolveSkill } from "./skill-catalog";
import type { ToolCallResult } from "./live-types";
import {
  REMEDIATION_STRATEGIES,
  TEACHING_MOVE_TYPES,
  runTutorTool,
} from "./tutor-tools";
import {
  boardResultExtras,
  cancelAttempt,
  createPolicy,
  normalizeSkill,
  noteBoardWrite,
  noteStudentUtterance,
  noteTutorTurn,
  parseHelpLevel,
  recordAttempt,
  rememberNote,
  setSessionFiles,
  type AttemptResult,
  type SessionFile,
  type TutorPolicy,
} from "./tutor-policy";

export type TeachingMoveType = (typeof TEACHING_MOVE_TYPES)[number];
export type RemediationStrategy = (typeof REMEDIATION_STRATEGIES)[number];

export type TeachingMoveEvidence = {
  id: string;
  callId?: string;
  skillKey: string | null;
  rawSkill: string;
  helpLevel: number;
  move: TeachingMoveType;
  diagnosis: string | null;
  strategy: RemediationStrategy | null;
  intent: string | null;
  occurredAt: number;
  cancelledAt: number | null;
};

export type TutoringDomainEvent =
  | { type: "attempt.recorded"; attempt: LearningAttemptEvidence }
  | { type: "teaching_move.recorded"; teachingMove: TeachingMoveEvidence }
  | { type: "evidence.cancelled"; callId: string; occurredAt: number };

export type TutorRuntimeHydration = {
  attempts: readonly LearningAttemptEvidence[];
  teachingMoves: readonly TeachingMoveEvidence[];
};

type TutorRuntimeOptions = {
  startedAt?: number;
  policy?: TutorPolicy;
  onEvent?: (event: TutoringDomainEvent) => void;
};

function eventId(prefix: string, now: number): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}_${uuid}` : `${prefix}_${now}_${Math.random().toString(36).slice(2, 10)}`;
}

function optionalText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function includesValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export class TutorRuntime {
  readonly policy: TutorPolicy;
  private readonly onEvent?: (event: TutoringDomainEvent) => void;
  private attempts: LearningAttemptEvidence[] = [];
  private teachingMoves: TeachingMoveEvidence[] = [];
  private assistance = new Map<string, number>();

  constructor(options: TutorRuntimeOptions = {}) {
    this.policy = options.policy ?? createPolicy(options.startedAt ?? Date.now());
    this.onEvent = options.onEvent;
  }

  noteStudentUtterance(text: string, now = Date.now()): void {
    noteStudentUtterance(this.policy, text, now);
  }

  noteTutorTurn(text: string, drew: boolean): void {
    noteTutorTurn(this.policy, text, drew);
  }

  noteBoardWrite(): void {
    noteBoardWrite(this.policy);
  }

  rememberNote(note: string): void {
    rememberNote(this.policy, note);
  }

  setSessionFiles(files: SessionFile[], now = Date.now()): void {
    setSessionFiles(this.policy, files, now);
  }

  boardResultExtras(now = Date.now()): string {
    return boardResultExtras(this.policy, now);
  }

  runTool(name: string, args: Record<string, unknown>, now = Date.now(), callId?: string): ToolCallResult | null {
    if (name === "record_teaching_move") return this.recordTeachingMove(args, now, callId);
    if (name !== "check_answer") return null;

    const rawSkill = typeof args.skill === "string" && args.skill.trim() ? args.skill.trim().slice(0, 120) : this.policy.currentSkill ?? "unnamed skill";
    const ledgerKey = normalizeSkill(rawSkill);
    const declaredHelp = parseHelpLevel(args.help_level);
    const observedHelp = this.assistance.get(ledgerKey);
    const effectiveHelp = Math.max(declaredHelp ?? 1, observedHelp ?? 0);
    const toolArgs = { ...args, skill: rawSkill, help_level: `H${effectiveHelp}` };
    const result = runTutorTool(name, toolArgs, this.policy, now, callId);
    if (!result?.success) return result;

    const policyAttempt = callId
      ? [...this.policy.attempts].reverse().find((attempt) => attempt.callId === callId)
      : this.policy.attempts.at(-1);
    if (policyAttempt) {
      const problem = typeof args.problem === "string" ? args.problem.slice(0, 300) : "";
      const studentAnswer = typeof args.student_answer === "string" ? args.student_answer.slice(0, 200) : "";
      const evidence: LearningAttemptEvidence = {
        id: eventId("attempt", now),
        ...(callId ? { callId } : {}),
        skillKey: resolveSkill(rawSkill)?.key ?? null,
        rawSkill,
        problem,
        problemFingerprint: problemFingerprint(problem),
        studentAnswer,
        result: policyAttempt.result,
        helpLevel: policyAttempt.help,
        occurredAt: now,
        cancelledAt: null,
      };
      this.attempts.push(evidence);
      this.onEvent?.({ type: "attempt.recorded", attempt: evidence });
    }
    this.assistance.delete(ledgerKey);
    return result;
  }

  cancelToolCall(callId: string, now = Date.now()): boolean {
    const removedAttempt = cancelAttempt(this.policy, callId);
    let changed = removedAttempt;
    this.attempts = this.attempts.map((attempt) => {
      if (attempt.callId !== callId || attempt.cancelledAt !== null) return attempt;
      changed = true;
      return { ...attempt, cancelledAt: now };
    });
    this.teachingMoves = this.teachingMoves.map((move) => {
      if (move.callId !== callId || move.cancelledAt !== null) return move;
      changed = true;
      return { ...move, cancelledAt: now };
    });
    if (changed) {
      this.rebuildAssistance();
      this.onEvent?.({ type: "evidence.cancelled", callId, occurredAt: now });
    }
    return changed;
  }

  hydrate(data: TutorRuntimeHydration): void {
    this.attempts = data.attempts.map((attempt) => ({ ...attempt }));
    this.teachingMoves = data.teachingMoves.map((move) => ({ ...move }));
    for (const attempt of this.attempts.slice().sort((a, b) => a.occurredAt - b.occurredAt)) {
      if (attempt.cancelledAt !== null) continue;
      recordAttempt(this.policy, {
        skill: attempt.rawSkill,
        result: attempt.result as AttemptResult,
        help: attempt.helpLevel,
        note: undefined,
        callId: attempt.callId,
      }, attempt.occurredAt);
    }
    this.rebuildAssistance();
  }

  snapshot(): TutorRuntimeHydration {
    return {
      attempts: this.attempts.map((attempt) => ({ ...attempt })),
      teachingMoves: this.teachingMoves.map((move) => ({ ...move })),
    };
  }

  private recordTeachingMove(args: Record<string, unknown>, now: number, callId?: string): ToolCallResult {
    const rawSkill = optionalText(args.skill, 120);
    const helpLevel = parseHelpLevel(args.help_level);
    if (!rawSkill || helpLevel === null || !includesValue(TEACHING_MOVE_TYPES, args.move)) {
      return { success: false, error: "record_teaching_move needs skill, help_level H0-H5, and a valid move." };
    }
    if (args.strategy !== undefined && !includesValue(REMEDIATION_STRATEGIES, args.strategy)) {
      return { success: false, error: "record_teaching_move strategy is not recognized." };
    }
    const evidence: TeachingMoveEvidence = {
      id: eventId("move", now),
      ...(callId ? { callId } : {}),
      skillKey: resolveSkill(rawSkill)?.key ?? null,
      rawSkill,
      helpLevel,
      move: args.move,
      diagnosis: optionalText(args.diagnosis, 240),
      strategy: includesValue(REMEDIATION_STRATEGIES, args.strategy) ? args.strategy : null,
      intent: optionalText(args.intent, 240),
      occurredAt: now,
      cancelledAt: null,
    };
    this.teachingMoves.push(evidence);
    const key = normalizeSkill(rawSkill);
    this.assistance.set(key, Math.max(this.assistance.get(key) ?? 0, helpLevel));
    this.onEvent?.({ type: "teaching_move.recorded", teachingMove: evidence });
    return { success: true, message: `Teaching move recorded at H${helpLevel}. Continue naturally; do not mention this record.` };
  }

  private rebuildAssistance(): void {
    this.assistance.clear();
    const lastAttemptBySkill = new Map<string, number>();
    for (const attempt of this.attempts) {
      if (attempt.cancelledAt === null) lastAttemptBySkill.set(normalizeSkill(attempt.rawSkill), Math.max(lastAttemptBySkill.get(normalizeSkill(attempt.rawSkill)) ?? 0, attempt.occurredAt));
    }
    for (const move of this.teachingMoves) {
      if (move.cancelledAt !== null) continue;
      const key = normalizeSkill(move.rawSkill);
      if (move.occurredAt <= (lastAttemptBySkill.get(key) ?? -Infinity)) continue;
      this.assistance.set(key, Math.max(this.assistance.get(key) ?? 0, move.helpLevel));
    }
  }
}

