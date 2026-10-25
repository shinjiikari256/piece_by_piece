import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { Me } from "../../../shared/api";
import { SESSION_COOKIE, SESSION_DAYS } from "./auth";
import type { Db } from "./db";
import { groups, settings, type users } from "./db/schema";

export type UserRow = typeof users.$inferSelect;

export interface AppConfig {
  /** Cookie только по HTTPS (в проде — да). */
  secureCookies: boolean;
  /** За обратным прокси (Caddy): IP клиента — из X-Forwarded-For. */
  trustProxy: boolean;
  /** Папка с шаблонами офлайн-файла (`game.html`, `editor.html` — `vite build --mode offline[-editor]`); нет шаблона — вариант недоступен. */
  offlineDir?: string;
}

export type AppEnv = {
  Variables: {
    db: Db;
    config: AppConfig;
    user: UserRow | null;
    sessionId: string | null;
    /** Запрос авторизован API-токеном, а не сессией: доступны только дела по ключу. */
    viaToken: boolean;
  };
};
export type Ctx = Context<AppEnv>;

/** Ответ-ошибка в едином формате. */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function parseBody<S extends z.ZodType>(c: Ctx, schema: S): Promise<z.output<S>> {
  const raw = await c.req.json().catch(() => {
    throw new ApiError(400, "invalid", "Некорректный запрос");
  });
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiError(400, "invalid", r.error.issues[0]?.message ?? "Некорректные данные");
  return r.data;
}

export function clientIp(c: Ctx): string {
  if (c.var.config.trustProxy) {
    const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }
  // @hono/node-server кладёт входящий запрос в env.incoming
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? "unknown";
}

export function setSessionCookie(c: Ctx, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: c.var.config.secureCookies,
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}
export const clearSessionCookie = (c: Ctx) => deleteCookie(c, SESSION_COOKIE, { path: "/" });

/** Общие поля пользователя в ответах API (`Me` и `AdminUser`). */
export const userCore = (u: UserRow, group: { id: number; name: string } | null) => ({
  id: u.id,
  login: u.login,
  fullName: u.fullName,
  role: u.role,
  status: u.status,
  group,
  mustChangePassword: u.mustChangePassword,
});

export async function toMe(db: Db, u: UserRow): Promise<Me> {
  const group = u.groupId ? ((await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, u.groupId)))[0] ?? null) : null;
  return userCore(u, group);
}

export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row ? (row.value as T) : fallback;
}

export async function putSetting(db: Db, key: string, value: unknown) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Текущий пользователь или 401. Пока пароль временный — доступны только смена пароля, /me и выход. */
export function requireUser(c: Ctx, opts: { allowTempPassword?: boolean } = {}): UserRow {
  const u = c.var.user;
  if (!u) throw new ApiError(401, "unauthorized", "Войдите в систему");
  if (u.mustChangePassword && !opts.allowTempPassword) throw new ApiError(403, "must_change_password", "Сначала смените временный пароль");
  return u;
}

export function requireStaff(c: Ctx): UserRow {
  const u = requireUser(c);
  if (u.role !== "admin" && u.role !== "teacher") throw new ApiError(403, "forbidden", "Только для преподавателей");
  return u;
}

export function requireAdmin(c: Ctx): UserRow {
  const u = requireUser(c);
  if (u.role !== "admin") throw new ApiError(403, "forbidden", "Только для администратора");
  return u;
}
