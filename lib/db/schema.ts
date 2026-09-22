import { pgTable, text, integer, bigint, jsonb, timestamp, serial, index, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

// ── Auth.js tables ─────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ── User profile (onboarding data) ─────────────────────────────────────────

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  gradeLevel: text("grade_level"),
  learningPrefs: jsonb("learning_prefs").default({}), // { hintVsAnswer, pace, examplesVsTheory, tone } all -1|0|1
  extraContext: text("extra_context"),
  voiceName: text("voice_name").default("marin"),
  tutorNotes: jsonb("tutor_notes").default([]), // string[] — durable facts recorded by the tutor
  onboarding: jsonb("onboarding").notNull().default({}), // { by, concern?, note? } — lib/onboarding.ts; '{}' for older profiles
  onboardedAt: timestamp("onboarded_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Tutoring sessions (renamed from sessions to avoid Auth.js collision) ───

export const tutorSessions = pgTable("tutor_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Session"),
  status: text("status").notNull().default("active"),
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  endedAt: bigint("ended_at", { mode: "number" }).notNull(),
  durationSec: integer("duration_sec").notNull().default(0),
  lastActiveAt: bigint("last_active_at", { mode: "number" }).notNull(),
  pausedAt: bigint("paused_at", { mode: "number" }),
  transcript: jsonb("transcript").notNull().default([]),
  // Highest session_events.seq handed out; lib/db/session-events.ts bumps it in
  // the same statement as the insert (lib/db/sql/2026-09-16-event-seq.sql).
  eventSeq: integer("event_seq").notNull().default(0),
  // The note the student reads afterwards, and the worker's queue for writing
  // it (lib/session-summary.ts, lib/db/sql/2026-09-21-session-summary.sql).
  summary: jsonb("summary"),
  summaryState: text("summary_state").notNull().default("none"), // none | pending | done | failed
  summaryError: text("summary_error"),
  summaryTries: integer("summary_tries").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessionEvents = pgTable(
  "session_events",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => tutorSessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    offsetMs: integer("offset_ms").notNull(),
    kind: text("kind").notNull(),
    actor: text("actor").notNull().default("system"),
    payload: jsonb("payload").notNull().default({}),
    // The recorder's own sequence number, for events in the same millisecond.
    clientSeq: integer("client_seq"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  // Unique since step B of lib/db/sql/2026-09-16-event-seq-unique.sql; there is
  // no migrations folder, so this line documents the index rather than creates it.
  (t) => [uniqueIndex("session_events_session_seq_uidx").on(t.sessionId, t.seq)],
);

// Board pictures recorded during sessions, for the admin replay (Sept 15 2026).
// The JPEG the tutor saw, as base64; one row per distinct picture per session.
export const sessionFrames = pgTable(
  "session_frames",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => tutorSessions.id, { onDelete: "cascade" }),
    offsetMs: integer("offset_ms").notNull(),
    hash: text("hash").notNull(),
    mime: text("mime").notNull().default("image/jpeg"),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),
    bytes: integer("bytes").notNull().default(0),
    data: text("data").notNull(),
    reason: text("reason").notNull().default("board"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("session_frames_session_offset_idx").on(t.sessionId, t.offsetMs),
    uniqueIndex("session_frames_session_hash_idx").on(t.sessionId, t.hash),
  ],
);

// ── Durable learning evidence ─────────────────────────────────────────────

export const skills = pgTable("skills", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  domain: text("domain").notNull(),
  gradeBand: text("grade_band").notNull(),
  aliases: jsonb("aliases").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const teachingMoves = pgTable(
  "teaching_moves",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => tutorSessions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    callId: text("call_id"),
    skillKey: text("skill_key").references(() => skills.key, { onDelete: "set null" }),
    rawSkill: text("raw_skill").notNull(),
    helpLevel: integer("help_level").notNull(),
    move: text("move").notNull(),
    diagnosis: text("diagnosis"),
    strategy: text("strategy"),
    intent: text("intent"),
    occurredAt: bigint("occurred_at", { mode: "number" }).notNull(),
    cancelledAt: bigint("cancelled_at", { mode: "number" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("teaching_moves_user_skill_time_idx").on(t.userId, t.skillKey, t.occurredAt),
    index("teaching_moves_session_call_idx").on(t.sessionId, t.callId),
  ],
);

export const learningAttempts = pgTable(
  "learning_attempts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => tutorSessions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    callId: text("call_id"),
    skillKey: text("skill_key").references(() => skills.key, { onDelete: "set null" }),
    rawSkill: text("raw_skill").notNull(),
    problem: text("problem").notNull(),
    problemFingerprint: text("problem_fingerprint").notNull(),
    studentAnswer: text("student_answer").notNull(),
    result: text("result").notNull(),
    helpLevel: integer("help_level").notNull(),
    occurredAt: bigint("occurred_at", { mode: "number" }).notNull(),
    cancelledAt: bigint("cancelled_at", { mode: "number" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("learning_attempts_user_skill_time_idx").on(t.userId, t.skillKey, t.occurredAt),
    index("learning_attempts_session_time_idx").on(t.sessionId, t.occurredAt),
    index("learning_attempts_session_call_idx").on(t.sessionId, t.callId),
  ],
);

export const learnerSkillStates = pgTable(
  "learner_skill_states",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    skillKey: text("skill_key").notNull().references(() => skills.key, { onDelete: "cascade" }),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull(),
    correctCount: integer("correct_count").notNull(),
    independentCorrectCount: integer("independent_correct_count").notNull(),
    distinctIndependentProblemCount: integer("distinct_independent_problem_count").notNull(),
    latestAttemptAt: bigint("latest_attempt_at", { mode: "number" }).notNull(),
    lastCorrectAt: bigint("last_correct_at", { mode: "number" }),
    lastIndependentAt: bigint("last_independent_at", { mode: "number" }),
    retainedAt: bigint("retained_at", { mode: "number" }),
    effectiveHelpLevel: integer("effective_help_level"),
    evidenceNote: text("evidence_note").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skillKey] }), index("learner_skill_states_user_status_idx").on(t.userId, t.status)],
);

// ── Types ──────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type TutorSession = typeof tutorSessions.$inferSelect;
export type NewTutorSession = typeof tutorSessions.$inferInsert;
export type SessionEvent = typeof sessionEvents.$inferSelect;
export type NewSessionEvent = typeof sessionEvents.$inferInsert;
export type SessionFrame = typeof sessionFrames.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type TeachingMove = typeof teachingMoves.$inferSelect;
export type LearningAttempt = typeof learningAttempts.$inferSelect;
export type LearnerSkillStateRow = typeof learnerSkillStates.$inferSelect;

export type SessionStatus = "active" | "paused" | "ended";
export type SessionEventKind =
  | "session.started"
  | "tool.call"
  | "live.debug"
  | "tutor.speaking"
  | "tutor.activity"
  | "board.frame"
  | "settings.speed"
  | "transcript.entry"
  | "whiteboard.snapshot"
  | "board.update.ready"
  | "board.update.failed"
  | "session.paused"
  | "session.resumed"
  | "session.ended";
export type SessionEventActor = "student" | "tutor" | "system";
