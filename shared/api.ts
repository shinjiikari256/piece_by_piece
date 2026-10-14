import { z } from "zod";

/**
 * Контракт HTTP API: схемы запросов и формы ответов — общие для сервера и клиента.
 * Ошибки всегда `{ error: <код>, message: <текст для человека> }`.
 */

export const Role = z.enum(["admin", "teacher", "student"]);
export type Role = z.infer<typeof Role>;

/** pending — зарегистрировался сам, ещё не подтверждён; blocked — вход закрыт. */
export const UserStatus = z.enum(["pending", "active", "blocked"]);
export type UserStatus = z.infer<typeof UserStatus>;

export const ROLE_LABEL: Record<Role, string> = {
  admin: "администратор",
  teacher: "преподаватель",
  student: "студент",
};
/** Варианты роли для выбора (студент, преподаватель, администратор). */
export const ROLE_OPTIONS = (["student", "teacher", "admin"] as const).map((value) => ({ value, label: ROLE_LABEL[value] }));
export const STATUS_LABEL: Record<UserStatus, string> = {
  pending: "не подтверждён",
  active: "подтверждён",
  blocked: "заблокирован",
};

/** Версия текста согласия на обработку ПДн: меняется — фиксируем, кто на какую соглашался. */
export const CONSENT_VERSION = "2026-10";
export const CONSENT_TEXT =
  "Я согласен(на) на обработку моих фамилии, имени, отчества, учебной группы и результатов прохождения дел " +
  "в учебных целях — для учёта результатов преподавателем. Согласие можно отозвать, обратившись к преподавателю.";

export const Login = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Логин — от 3 символов")
  .max(32, "Логин — до 32 символов")
  .regex(
    /^[a-z0-9._-]+$/,
    "В логине — латинские буквы, цифры, точка, дефис, подчёркивание",
  );

export const Password = z
  .string()
  .min(8, "Пароль — от 8 символов")
  .max(128, "Пароль — до 128 символов");

export const FullName = z
  .string()
  .trim()
  .min(3, "Укажите ФИО")
  .max(120, "ФИО слишком длинное");

export const RegisterBody = z.object({
  login: Login,
  fullName: FullName,
  password: Password,
  consent: z.literal(true, { error: "Нужно согласие на обработку данных" }),
  joinToken: z.string().max(64).optional(),
});
export type RegisterBody = z.input<typeof RegisterBody>;

export const LoginBody = z.object({
  login: z.string().trim().toLowerCase().max(64),
  password: z.string().max(128),
});
export type LoginBody = z.input<typeof LoginBody>;

export const PasswordBody = z.object({
  /** Не нужен, если пароль временный (mustChangePassword). */
  oldPassword: z.string().max(128).optional(),
  newPassword: Password,
});
export type PasswordBody = z.input<typeof PasswordBody>;

export interface GroupRef {
  id: number;
  name: string;
}

export interface Me {
  id: number;
  login: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  group: GroupRef | null;
  mustChangePassword: boolean;
}

export interface JoinInfo {
  group: GroupRef;
}

// ---------- Админка ----------

export interface AdminUser extends Me {
  createdAt: string;
  /** Пришёл по ссылке группы. */
  viaLink: boolean;
}

export const UsersQuery = z.object({
  status: UserStatus.optional(),
  role: Role.optional(),
  /** id группы или "none" — без группы. */
  group: z.union([z.coerce.number().int(), z.literal("none")]).optional(),
  q: z.string().trim().max(100).optional(),
});

/** Массовое изменение: выделенные строки → статус / группа / роль (роль — только администратор). */
export const UsersPatch = z.object({
  ids: z.array(z.number().int()).min(1).max(1000),
  set: z
    .object({
      status: UserStatus.optional(),
      groupId: z.number().int().nullable().optional(),
      role: Role.optional(),
    })
    .refine((s) => Object.keys(s).length > 0, "Нечего менять"),
});
export type UsersPatch = z.input<typeof UsersPatch>;

export const ResetPasswordBody = z.object({ password: Password.optional() });

export const UserEditBody = z.object({ fullName: FullName });

export interface AdminGroup extends GroupRef {
  teacherIds: number[];
  students: number;
  pending: number;
}

export const GroupBody = z.object({
  name: z.string().trim().min(1, "Название группы").max(60),
  teacherIds: z.array(z.number().int()).optional(),
});

export interface JoinLink {
  id: number;
  groupId: number;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  /** Сколько зарегистрировалось и сколько из них ждёт подтверждения. */
  registered: number;
  pending: number;
}

export const LinkBody = z.object({
  expiresAt: z.iso.datetime().nullable().optional(),
});

export interface Settings {
  registrationOpen: boolean;
}
export const SettingsBody = z.object({ registrationOpen: z.boolean() });

// ---------- Результаты ----------

/** Итог прохождения, который клиент отправляет после сдачи дела (пока баллы считает браузер). */
export const ResultBody = z.object({
  caseId: z.string().min(1).max(100),
  caseNumber: z.string().max(20),
  caseTitle: z.string().max(200),
  total: z.number().int().min(0).max(1000),
  max: z.number().int().min(0).max(1000),
  hintsUsed: z.number().int().min(0).max(50),
  wrongDeductions: z.number().int().min(0).max(10_000),
  elapsedMs: z.number().int().min(0).nullable(),
  /** Полный подсчёт (shared/scoring.ts Score) — для экрана результата. */
  score: z.record(z.string(), z.unknown()),
  /** Что сдал игрок (shared/judge.ts FinishInput) — для пересчёта. */
  input: z.record(z.string(), z.unknown()).nullable(),
  caseConfigVersion: z.string().max(64).nullable(),
  gameVersion: z.string().max(32).nullable(),
  resultFormatVersion: z.number().int(),
  finishedAt: z.iso.datetime(),
});
export type ResultBody = z.input<typeof ResultBody>;

export interface ServerResult extends Omit<ResultBody, "score" | "input"> {
  id: number;
  score: unknown;
  input: unknown;
}

/** Сводка по пользователю для карточки в админке. */
export interface UserStats {
  attempts: number;
  /** Сколько разных дел пройдено. */
  cases: number;
  /** Средний и лучший процент от максимума (с бонусом), 0–100+. */
  avgPercent: number | null;
  bestPercent: number | null;
  avgHints: number | null;
  avgWrongDeductions: number | null;
  avgMinutes: number | null;
  lastAt: string | null;
}

export interface UserDetail {
  user: AdminUser;
  results: ServerResult[];
  stats: UserStats;
}

// ---------- Список прохождений и аналитика (страница «Результаты») ----------

/** Фильтры: студент видит только свои; user = "me" — свои у преподавателя. */
export const ResultsQuery = z.object({
  case: z.string().max(100).optional(),
  group: z.union([z.coerce.number().int(), z.literal("none")]).optional(),
  user: z.union([z.coerce.number().int(), z.literal("me")]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});
export type ResultsQuery = z.input<typeof ResultsQuery>;

export interface ResultListItem extends ServerResult {
  user: { id: number; fullName: string; login: string; group: GroupRef | null };
}

export interface ResultsPage {
  items: ResultListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ResultsFilters {
  cases: { id: string; number: string; title: string }[];
  groups: GroupRef[];
  users: { id: number; fullName: string; group: string | null }[];
}

export interface ResultsStats {
  attempts: number;
  users: number;
  cases: number;
  /** Доля от максимума без бонуса за время, %. */
  avgPercent: number | null;
  medianPercent: number | null;
  avgMinutes: number | null;
  avgHints: number | null;
  avgWrongDeductions: number | null;
  /** Сколько получили бонус за время. */
  bonusShare: number | null;
  /** Распределение баллов: 0–39, 40–64, 65–84, 85–99, 100+ (% от базы). */
  buckets: { label: string; count: number }[];
  /** Средний процент по разделам решения (определение права, квалификация…). */
  sections: { label: string; percent: number }[];
  /** Сколько подсказок брали: 0, 1, 2, 3+. */
  hints: { label: string; count: number }[];
}
