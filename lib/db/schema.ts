import {
  pgTable,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  serial,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("session_events_session_seq_idx").on(t.sessionId, t.seq)],
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

export type SessionStatus = "active" | "paused" | "ended";
export type SessionEventKind =
  | "transcript.entry"
  | "whiteboard.snapshot"
  | "board.update.ready"
  | "board.update.failed"
  | "session.paused"
  | "session.resumed"
  | "session.ended";
export type SessionEventActor = "student" | "tutor" | "system";
