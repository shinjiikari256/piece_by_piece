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
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("results_user_idx").on(t.userId), index("results_case_idx").on(t.caseId)],
);
