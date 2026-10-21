import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Схема базы. Изменили — `pnpm db:generate` (миграция в apps/server/src/db/migrations), применяется при старте сервера. */

export const role = pgEnum("role", ["admin", "teacher", "student"]);
export const userStatus = pgEnum("user_status", [
  "pending",
  "active",
  "blocked",
]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const groups = pgTable(
  "groups",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("groups_name_idx").on(sql`lower(${t.name})`)],
);

export const users = pgTable(
  "users",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Всегда в нижнем регистре. */
    login: text("login").notNull().unique(),
    fullName: text("full_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** Пароль выдан преподавателем — при входе нужно сменить. */
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    role: role("role").notNull().default("student"),
    status: userStatus("status").notNull().default("pending"),
    groupId: integer("group_id").references(() => groups.id, {
      onDelete: "set null",
    }),
    joinLinkId: integer("join_link_id").references(
      (): AnyPgColumn => joinLinks.id,
      { onDelete: "set null" },
    ),
    consentVersion: text("consent_version"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("users_group_idx").on(t.groupId),
    index("users_status_idx").on(t.status),
  ],
);

/** Сессия: в cookie — случайный токен, в базе — его SHA-256. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** «Свои группы» преподавателя. */
export const groupTeachers = pgTable(
  "group_teachers",
  {
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })],
);

/** Ссылка регистрации с группой (/?join=<token>, можно QR). */
export const joinLinks = pgTable("join_links", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  groupId: integer("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: integer("created_by").references((): AnyPgColumn => users.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

/** Журнал действий с пользователями и группами (кто, что, над кем). */
export const auditLog = pgTable("audit_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  payload: jsonb("payload"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Результаты прохождений вошедших игроков. Пока баллы считает браузер (source = "client");
 * когда проверка переедет на сервер, сюда будут писаться итоги серверных попыток.
 */
export const results = pgTable(
  "results",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    caseId: text("case_id").notNull(),
    caseNumber: text("case_number").notNull(),
    caseTitle: text("case_title").notNull(),
    total: integer("total").notNull(),
    max: integer("max").notNull(),
    hintsUsed: integer("hints_used").notNull(),
    wrongDeductions: integer("wrong_deductions").notNull(),
    elapsedMs: integer("elapsed_ms"),
    score: jsonb("score").notNull(),
    input: jsonb("input"),
    caseConfigVersion: text("case_config_version"),
    gameVersion: text("game_version"),
    resultFormatVersion: integer("result_format_version").notNull(),
    source: text("source").notNull().default("client"),
    /** Попытка, из которой получен результат (серверные результаты). */
    attemptId: text("attempt_id"),
    /** Мероприятие, в рамках которого пройдено дело (нет — свободная игра). */
    eventId: integer("event_id"),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("results_user_idx").on(t.userId), index("results_case_idx").on(t.caseId)],
);

/** Дело на сервере; само содержимое — в версиях, `current_version_id` указывает на действующую. */
export const cases = pgTable("cases", {
  id: text("id").primaryKey(),
  currentVersionId: integer("current_version_id").references((): AnyPgColumn => caseVersions.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

/** Неизменяемая версия дела: полный `CaseFile` (с ответами). Одинаковое содержимое второй раз не пишется. */
export const caseVersions = pgTable(
  "case_versions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    caseId: text("case_id")
      .notNull()
      .references((): AnyPgColumn => cases.id, { onDelete: "cascade" }),
    body: jsonb("body").notNull(),
    formatVersion: integer("format_version").notNull(),
    /** `updatedAt` из самого дела — то, что игрок видит как версию конфигурации. */
    caseUpdatedAt: text("case_updated_at"),
    contentHash: text("content_hash").notNull(),
    createdBy: integer("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("case_versions_hash_idx").on(t.caseId, t.contentHash)],
);

export type AttemptStatus = "active" | "finished" | "reset" | "abandoned";

/**
 * Прохождение дела на сервере. Время, подсказки и ошибки считает сервер по событиям, клиенту не верит.
 * `started_at` пуст, пока игрок не нажал «Начать» (чтение вступления не в счёт); `paused_ms` — накопленные паузы.
 */
export type DebriefPolicy = "immediate" | "after_close" | "never";

/** Мероприятие: набор дел для групп в окне времени, с правилами разбора и числом зачётных попыток. */
export const events = pgTable("events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  debriefPolicy: text("debrief_policy").$type<DebriefPolicy>().notNull().default("immediate"),
  /** Сколько раз можно сдать дело в мероприятии; нет — без ограничения. */
  maxScoredAttempts: integer("max_scored_attempts"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const eventCases = pgTable(
  "event_cases",
  {
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    caseId: text("case_id").notNull().references((): AnyPgColumn => cases.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.caseId] })],
);

/** Доступ групп к мероприятию. */
export const eventAccess = pgTable(
  "event_access",
  {
    eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    groupId: integer("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.groupId] })],
);

export const attempts = pgTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    caseId: text("case_id")
      .notNull()
      .references((): AnyPgColumn => cases.id, { onDelete: "cascade" }),
    caseVersionId: integer("case_version_id")
      .notNull()
      .references((): AnyPgColumn => caseVersions.id),
    status: text("status").$type<AttemptStatus>().notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pausedMs: integer("paused_ms").notNull().default(0),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull().defaultNow(),
    hintsUsed: integer("hints_used").notNull().default(0),
    wrongDeductions: integer("wrong_deductions").notNull().default(0),
    /** Брошенные и начатые заново попытки не идут в статистику. */
    excludedFromStats: boolean("excluded_from_stats").notNull().default(false),
    /** Мероприятие, в рамках которого идёт попытка (нет — свободная игра). */
    eventId: integer("event_id").references((): AnyPgColumn => events.id, { onDelete: "set null" }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("attempts_user_case_idx").on(t.userId, t.caseId, t.status)],
);

/** Журнал событий попытки: start, check, hint, pause, resume, finish, reset, abandoned. */
export const attemptEvents = pgTable(
  "attempt_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attempt_events_attempt_idx").on(t.attemptId)],
);
