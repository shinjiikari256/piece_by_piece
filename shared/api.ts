import { z } from "zod";
import type { CaseFile } from "./case";
import type { PublicCase } from "./public-case";

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
  .regex(/^[a-z0-9._-]+$/, "В логине — латинские буквы, цифры, точка, дефис, подчёркивание");

export const Password = z.string().min(8, "Пароль — от 8 символов").max(128, "Пароль — до 128 символов");

export const FullName = z.string().trim().min(3, "Укажите ФИО").max(120, "ФИО слишком длинное");

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

/** Объединение дублей: прохождения переходят к `intoId`, исходная запись удаляется. */
export const UserMergeBody = z.object({ intoId: z.number().int().positive() });

export interface AdminGroup extends GroupRef {
  teacherIds: number[];
  students: number;
  pending: number;
}

export const GroupBody = z.object({
  name: z.string().trim().min(1, "Название группы").max(60),
  teacherIds: z.array(z.number().int()).optional(),
});

/** Вариант офлайн-файла: только игра или игра с конструктором. */
export const OFFLINE_VARIANTS = ["game", "editor"] as const;
export type OfflineVariant = (typeof OFFLINE_VARIANTS)[number];
export const OFFLINE_VARIANT_LABEL: Record<OfflineVariant, string> = { game: "Только игра", editor: "Игра и конструктор" };

/** Собрать офлайн-файл с выбранными делами (`POST /admin/offline`). */
export const OfflineBuildBody = z.object({
  variant: z.enum(OFFLINE_VARIANTS),
  caseIds: z.array(z.string().min(1)).min(1).max(500),
});
export type OfflineBuildBody = z.infer<typeof OfflineBuildBody>;

/** Кому видно дело: всем, включая гостей (`public`), всем вошедшим (`all`) только группам из списка (`groups`) или никому (`none`). */
export const CaseVisibilityBody = z.object({
  mode: z.enum(["public", "all", "groups", "none"]),
  groupIds: z.array(z.number().int()).max(500),
});
export type CaseVisibilityBody = z.infer<typeof CaseVisibilityBody>;
export interface CaseVisibility extends CaseVisibilityBody {
  /** Группы из списка, которых нет у этого сотрудника: он их видит, но менять не может. */
  lockedGroupIds: number[];
}

export interface JoinLink {
  id: number;
  groupId: number;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  /** Регистрирующиеся по ссылке сразу активны. */
  autoApprove: boolean;
  /** Сколько зарегистрировалось и сколько из них ждёт подтверждения. */
  registered: number;
  pending: number;
}

export const LinkBody = z.object({
  expiresAt: z.iso.datetime().nullable().optional(),
  /** По умолчанию — подтверждать сразу. */
  autoApprove: z.boolean().optional(),
});

export const CaseEditorsBody = z.object({ userIds: z.array(z.number().int()).max(100) });

export const ApiTokenBody = z.object({ name: z.string().trim().min(1, "Назовите токен").max(60) });
export interface ApiTokenInfo {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export const DeleteResultsBody = z.object({ ids: z.array(z.number().int()).min(1).max(500) });

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

// ——— Дела и судья ———

/** Сводка дела для списка (то же, что `CaseSummary` в клиенте, без черновиков). */
export interface ServerCaseSummary {
  id: string;
  number: string;
  title: string;
  tagline: string;
  difficulty: CaseFile["difficulty"];
  published: boolean;
  timeBonus?: CaseFile["timeBonus"];
  evidenceCount: number;
  deductionCount: number;
  updatedAt?: string;
  meta?: CaseFile["meta"];
}

/** Дело без ответов и версия, по которой его будут проверять. */
export interface ServerPublicCase {
  caseVersionId: number;
  caseFile: PublicCase;
}

export const CheckDeductionBody = z.object({ optionId: z.string().min(1).max(100) });

export const DebriefPolicy = z.enum(["immediate", "after_close", "never"]);
export type DebriefPolicy = z.infer<typeof DebriefPolicy>;
export const DEBRIEF_POLICY_LABEL: Record<DebriefPolicy, string> = {
  immediate: "сразу после сдачи",
  after_close: "после закрытия мероприятия",
  never: "не показывать",
};

const DateTime = z.iso.datetime({ offset: true });
export const EventBody = z.object({
  title: z.string().trim().min(1, "Нужно название").max(200),
  opensAt: DateTime.nullable().default(null),
  closesAt: DateTime.nullable().default(null),
  debriefPolicy: DebriefPolicy.default("immediate"),
  maxScoredAttempts: z.number().int().min(1).max(100).nullable().default(null),
  caseIds: z.array(z.string()).min(1, "Выберите хотя бы одно дело"),
  groupIds: z.array(z.number().int()).default([]),
});
export type EventBody = z.infer<typeof EventBody>;

export interface ServerEvent {
  id: number;
  title: string;
  opensAt: string | null;
  closesAt: string | null;
  debriefPolicy: DebriefPolicy;
  maxScoredAttempts: number | null;
  caseIds: string[];
  groupIds: number[];
  /** Идёт ли сейчас окно времени. */
  open: boolean;
  /** Сколько раз игрок уже сдал каждое дело в мероприятии (только для студента). */
  doneByCase?: Record<string, number>;
}

/** Файл результата офлайн-игрока (`state/result-file.ts`); баллы в нём «для глаз», портал считает сам. */
export const ResultFileSchema = z.object({
  type: z.literal("pokusochkam-result"),
  resultFormatVersion: z.number().int(),
  gameVersion: z.string().nullable(),
  offline: z.boolean().optional(),
  player: z.object({ name: z.string().max(200), group: z.string().max(200) }),
  case: z.object({ id: z.string().max(100), number: z.string().max(50), title: z.string().max(300), configVersion: z.string().nullable() }),
  finishedAt: z.iso.datetime({ offset: true }),
  total: z.number().optional(),
  max: z.number().optional(),
  input: z.object({
    answers: z.record(z.string(), z.array(z.string())),
    hintsUsed: z.number().int().min(0),
    elapsedMs: z.number().min(0).nullable(),
    wrongDeductions: z.number().int().min(0),
    importantEvidence: z.array(z.string()).default([]),
  }),
});
export type ResultFile = z.infer<typeof ResultFileSchema>;

export const ImportBody = z.object({
  /** Только показать, что получится, ничего не записывая. */
  dryRun: z.boolean().default(false),
  items: z
    .array(z.object({ file: z.unknown(), userId: z.number().int().optional() }))
    .min(1)
    .max(200),
});

export type ImportStatus = "imported" | "would_import" | "duplicate" | "unmatched" | "ambiguous" | "invalid" | "no_case";
export interface ImportItemResult {
  status: ImportStatus;
  message?: string;
  player?: string;
  caseTitle?: string;
  /** Кого нашли (или выбрал преподаватель). */
  userId?: number;
  /** Кандидаты, если подходит несколько. */
  candidates?: { id: number; fullName: string; group: string | null }[];
  /** Пересчитанные баллы. */
  total?: number;
  max?: number;
  /** Версия дела в файле не найдена — считали по текущей. */
  versionChanged?: boolean;
}

export const AttemptStartBody = z.object({
  /** Мероприятие, в рамках которого проходится дело. */
  eventId: z.number().int().optional(),
  /** Начать заново: действующая попытка закрывается как reset. */
  fresh: z.boolean().optional(),
});

/** Прохождение на сервере: дело без ответов и то, что сервер уже насчитал. */
export interface ServerAttempt {
  attemptId: string;
  caseVersionId: number;
  caseFile: PublicCase;
  /** Игрок уже нажимал «Начать» (время идёт). */
  started: boolean;
  hintsUsed: number;
  wrongDeductions: number;
  elapsedMs: number | null;
}

/** Сдача: время, подсказки и ошибки сервер берёт из попытки, а не из запроса. */
export const FinishBody = z.object({
  answers: z.record(z.string(), z.array(z.string().max(100)).max(100)),
  importantEvidence: z.array(z.string().max(100)).max(500),
  gameVersion: z.string().max(32).nullable().optional(),
});
export type FinishBody = z.input<typeof FinishBody>;

// ---------- Сохранения расследований на сервере ----------

/** Предел размера одного сохранения (JSON, байт): защита базы от мусора, настоящее сохранение — десятки килобайт. */
export const MAX_SAVE_BYTES = 512 * 1024;

/** Сохранение, как его хранит клиент (`SaveData`): сервер кладёт его как есть и разбирает только заголовок. */
export const SaveBody = z.looseObject({
  v: z.number().int(),
  caseId: z.string().min(1).max(100),
  savedAt: z.number().int().nonnegative(),
});
export type SaveBody = z.infer<typeof SaveBody>;
