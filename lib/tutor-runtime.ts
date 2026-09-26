import { problemFingerprint, type LearningAttemptEvidence } from "./learning-evidence";
import { resolveSkill } from "./skill-catalog";
import type { ToolCallResult } from "./live-types";
import {
  REMEDIATION_STRATEGIES,
  TEACHING_MOVE_TYPES,
  minimumHelpForMove,
  runTutorTool,
  autoCheck,
  takeAutoCheckNote,
  withholdResult,
} from "./tutor-tools";
import {
  boardResultExtras,
  cancelAttempt,
  boardNote,
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
  type TutorPolicy, type VerdictMarks, noteBoardMark } from "./tutor-policy";

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

function assistanceKey(rawSkill: string): string {
  return resolveSkill(rawSkill)?.key ?? normalizeSkill(rawSkill);
}

export class TutorRuntime {
  readonly policy: TutorPolicy;
  private onEvent?: (event: TutoringDomainEvent) => void;
  private attempts: LearningAttemptEvidence[] = [];
  private teachingMoves: TeachingMoveEvidence[] = [];
  private assistance = new Map<string, number>();
  /**
   * The student's spoken working that check_answer carries (`working`), for the
   * board to write in their hand before their answer. Set by the session page.
   */
  private onWorking?: (lines: string[], answer: string) => void;

  setWorkingSink(onWorking?: (lines: string[], answer: string) => void): void {
    this.onWorking = onWorking;
  }

  /**
   * Code-owned marks (Sept 26 2026): with a sink, a checked answer goes up in
   * the student's hand and is ringed or has its earlier wrong line struck by
   * the page, and the verdict tells the model it is done. Without one the
   * model is asked to do it, as before.
   */
  private onMarks?: (marks: VerdictMarks) => void;

  setMarkSink(onMarks?: (marks: VerdictMarks) => void): void {
    this.onMarks = onMarks;
    this.policy.codeMarks = Boolean(onMarks);
  }

  private flushMarks(): void {
    const marks = this.policy.pendingMarks;
    this.policy.pendingMarks = null;
    if (marks) this.onMarks?.(marks);
  }

  constructor(options: TutorRuntimeOptions = {}) {
    this.policy = options.policy ?? createPolicy(options.startedAt ?? Date.now());
    this.onEvent = options.onEvent;
  }

  setEventSink(onEvent?: (event: TutoringDomainEvent) => void): void {
    this.onEvent = onEvent;
  }

  noteStudentUtterance(text: string, now = Date.now()): void {
    noteStudentUtterance(this.policy, text, now);
    // An answer the board can check is checked here, before the model speaks.
    const note = autoCheck(this.policy, text, now);
    if (!note) return;
    this.flushMarks();
    // It is evidence like any checked answer (until Sept 26 2026 only the
    // model's own check_answer calls reached learning evidence, the pet's hop
    // and the plan box).
    const auto = this.policy.autoChecked;
    const attempt = this.policy.attempts.at(-1);
    if (!auto || !attempt?.auto) return;
    const rawSkill = attempt.skill;
    const evidence: LearningAttemptEvidence = {
      id: eventId("attempt", now),
      skillKey: resolveSkill(rawSkill)?.key ?? null,
      rawSkill,
      problem: auto.problem.slice(0, 300),
      problemFingerprint: problemFingerprint(auto.problem),
      studentAnswer: auto.answer.slice(0, 200),
      result: attempt.result,
      helpLevel: attempt.help,
      occurredAt: now,
      cancelledAt: null,
    };
    this.attempts.push(evidence);
    this.onEvent?.({ type: "attempt.recorded", attempt: evidence });
  }

  /** The auto-check's note for a typed line, once; the voice path gets it on the first tool result. */
  takeAutoCheckNote(): string | null {
    return takeAutoCheckNote(this.policy);
  }

  noteTutorTurn(text: string, drew: boolean, marked = false): void {
    noteTutorTurn(this.policy, text, drew, marked);
  }

  /** The private note to send between turns when the board was left alone, or null. */
  boardNote(text: string, drew: boolean, marked = false): string | null {
    return boardNote(this.policy, text, drew, marked);
  }

  /** A highlight, ring or point on the board: H2 help for the next answer. */
  noteBoardMark(): void {
    noteBoardMark(this.policy);
  }

  /** A board call as it should go up: a result the student has not said becomes "= ?" (with the note to add to its result). */
  shapeBoardCall(name: string, args: Record<string, unknown>): { args: Record<string, unknown>; note: string | null } {
    return withholdResult(this.policy, name, args);
  }

  noteBoardWrite(name?: string, args?: Record<string, unknown>): void {
    noteBoardWrite(this.policy, name, args);
  }

  rememberNote(note: string): void {
    rememberNote(this.policy, note);
  }

  /** The session went live: the clock counts from here. */
  startClock(now = Date.now()): void {
    this.policy.startedAt = now;
  }

  /** How long they said they have (the intake), so the state line keeps the clock. */
  setPlannedMinutes(minutes: number | null): void {
    this.policy.plannedMinutes = minutes && minutes > 0 ? minutes : null;
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
    const ledgerKey = assistanceKey(rawSkill);
    // The help given since their last answer, carried by check_answer itself
    // (Sept 24 2026; it was record_teaching_move, one more call before speech).
    // Recorded as teaching moves just before the attempt, so the stored rows
    // and the server's help calculation are what they were.
    const moves = Array.isArray(args.moves) ? args.moves.filter((m): m is TeachingMoveType => includesValue(TEACHING_MOVE_TYPES, m)) : [];
    const misconception = optionalText(args.misconception, 240);
    const declared = parseHelpLevel(args.help_level);
    moves.forEach((move, i) => {
      this.recordTeachingMove(
        { skill: rawSkill, help_level: `H${Math.max(declared ?? 0, minimumHelpForMove(move))}`, move, ...(misconception && i === moves.length - 1 ? { diagnosis: misconception } : {}) },
        now - 1,
        callId,
      );
    });
    const working = Array.isArray(args.working)
      ? args.working.filter((l): l is string => typeof l === "string" && /\d/.test(l)).map((l) => l.trim().slice(0, 80)).slice(0, 4)
      : [];
    if (working.length) this.onWorking?.(working, typeof args.student_answer === "string" ? args.student_answer : String(args.student_answer ?? ""));
    const declaredHelp = parseHelpLevel(args.help_level);
    const observedHelp = this.assistance.get(ledgerKey);
    const effectiveHelp = Math.max(declaredHelp ?? 1, observedHelp ?? 0);
    const toolArgs = { ...args, skill: rawSkill, help_level: `H${effectiveHelp}` };
    const result = runTutorTool(name, toolArgs, this.policy, now, callId);
    if (!result?.success) return result;
    this.flushMarks();

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
    // Name what is allowed: a bare "not valid" left the model retrying the
    // same call three times in an eval (move "self_explanation", Sept 22 2026).
    if (!rawSkill || helpLevel === null || !includesValue(TEACHING_MOVE_TYPES, args.move)) {
      return { success: false, error: `record_teaching_move needs skill, help_level H0-H5, and move, one of: ${TEACHING_MOVE_TYPES.join(", ")}.` };
    }
    if (args.strategy !== undefined && !includesValue(REMEDIATION_STRATEGIES, args.strategy)) {
      return { success: false, error: `record_teaching_move strategy is one of: ${REMEDIATION_STRATEGIES.join(", ")} (or leave it out).` };
    }
    const effectiveHelp = Math.max(helpLevel, minimumHelpForMove(args.move));
    const evidence: TeachingMoveEvidence = {
      id: eventId("move", now),
      ...(callId ? { callId } : {}),
      skillKey: resolveSkill(rawSkill)?.key ?? null,
      rawSkill,
      helpLevel: effectiveHelp,
      move: args.move,
      diagnosis: optionalText(args.diagnosis, 240),
      strategy: includesValue(REMEDIATION_STRATEGIES, args.strategy) ? args.strategy : null,
      intent: optionalText(args.intent, 240),
      occurredAt: now,
      cancelledAt: null,
    };
    this.teachingMoves.push(evidence);
    const key = assistanceKey(rawSkill);
    this.assistance.set(key, Math.max(this.assistance.get(key) ?? 0, effectiveHelp));
    this.onEvent?.({ type: "teaching_move.recorded", teachingMove: evidence });
    return { success: true, message: `Teaching move recorded at H${effectiveHelp}. Continue naturally; do not mention this record.` };
  }

  private rebuildAssistance(): void {
    this.assistance.clear();
    const lastAttemptBySkill = new Map<string, number>();
    for (const attempt of this.attempts) {
      if (attempt.cancelledAt === null) lastAttemptBySkill.set(assistanceKey(attempt.rawSkill), Math.max(lastAttemptBySkill.get(assistanceKey(attempt.rawSkill)) ?? 0, attempt.occurredAt));
    }
    for (const move of this.teachingMoves) {
      if (move.cancelledAt !== null) continue;
      const key = assistanceKey(move.rawSkill);
      if (move.occurredAt <= (lastAttemptBySkill.get(key) ?? -Infinity)) continue;
      this.assistance.set(key, Math.max(this.assistance.get(key) ?? 0, move.helpLevel));
    }
  }
}
