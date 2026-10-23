import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";
import type { Db } from "./db";
import { users } from "./db/schema";

/**
 * Первый администратор: если в базе нет ни одного — создаётся из ADMIN_LOGIN / ADMIN_PASSWORD.
 * Существующих не трогаем (пароль потом меняется в профиле).
 */
export async function ensureAdmin(db: Db, login: string | undefined, password: string | undefined): Promise<"created" | "exists" | "skipped"> {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  if (admin) return "exists";
  if (!login || !password) return "skipped";
  await db.insert(users).values({
    login: login.trim().toLowerCase(),
    fullName: "Администратор",
    passwordHash: await hashPassword(password),
    role: "admin",
    status: "active",
  });
  return "created";
}
