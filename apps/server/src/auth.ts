import { createHash, randomBytes, randomInt } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, ne } from "drizzle-orm";
import type { Db } from "./db";
import { sessions, users } from "./db/schema";

/** Пароли — Argon2id (параметры по умолчанию библиотеки: 19 МиБ, 2 прохода). */
export const hashPassword = (password: string) => hash(password);
export const verifyPassword = (passwordHash: string, password: string) => verify(passwordHash, password).catch(() => false);

/** Хеш-заглушка: при входе с несуществующим логином всё равно тратим время на проверку. */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword("заглушка-для-выравнивания-времени");
  await verifyPassword(await dummyHash, password);
}

/** Временный пароль: без похожих символов (0/O, 1/l/I), чтобы его можно было продиктовать. */
export function generatePassword(length = 10): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const SESSION_COOKIE = "nr_sid";
export const SESSION_DAYS = 30;

export async function createSession(db: Db, userId: number): Promise<{ token: string; id: string; expiresAt: Date }> {
  const token = randomToken();
  const id = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { token, id, expiresAt };
}

export async function findSession(db: Db, token: string) {
  const id = sha256(token);
  const [row] = await db
    .select({ sessionId: sessions.id, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}

export const deleteSession = (db: Db, id: string) => db.delete(sessions).where(eq(sessions.id, id));

/** Все сессии пользователя, кроме (необязательно) текущей. */
export const deleteUserSessions = (db: Db, userId: number, except?: string) =>
  db.delete(sessions).where(except ? and(eq(sessions.userId, userId), ne(sessions.id, except)) : eq(sessions.userId, userId));
