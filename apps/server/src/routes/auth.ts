import { Hono } from "hono";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { CONSENT_VERSION, LoginBody, PasswordBody, RegisterBody, type JoinInfo } from "../../../../shared/api";
import { burnPasswordCheck, createSession, deleteSession, deleteUserSessions, hashPassword, verifyPassword } from "../auth";
import type { Db } from "../db";
import { groups, joinLinks, users } from "../db/schema";
import { RateLimiter } from "../rate-limit";
import { ApiError, clearSessionCookie, clientIp, getSetting, parseBody, requireUser, setSessionCookie, toMe, type AppEnv } from "../http";

/** Действующая ссылка регистрации: не отозвана и не истекла. */
export async function findJoinLink(db: Db, token: string) {
  const [row] = await db
    .select({ link: joinLinks, group: { id: groups.id, name: groups.name } })
    .from(joinLinks)
    .innerJoin(groups, eq(groups.id, joinLinks.groupId))
    .where(and(eq(joinLinks.token, token), isNull(joinLinks.revokedAt), or(isNull(joinLinks.expiresAt), gt(joinLinks.expiresAt, new Date()))));
  return row ?? null;
}

/** Маршруты входа; у каждого экземпляра приложения — свои счётчики попыток. */
export function authRoutes() {
  /** Вход: 5 попыток в минуту на IP+логин. Регистрация: 20 в час на IP (группа за одним NAT — нормально). */
  const loginLimiter = new RateLimiter("login", 5, 60_000);
  const registerLimiter = new RateLimiter("register", 20, 3_600_000);

  return (
    new Hono<AppEnv>()
      .post("/auth/register", async (c) => {
        const db = c.var.db;
        if (!(await getSetting(db, "registrationOpen", true))) throw new ApiError(403, "registration_closed", "Регистрация сейчас закрыта — обратитесь к преподавателю");
        if (!(await registerLimiter.take(db, clientIp(c)))) throw new ApiError(429, "rate_limited", "Слишком много регистраций, попробуйте позже");
        const body = await parseBody(c, RegisterBody);
        const link = body.joinToken ? await findJoinLink(db, body.joinToken) : null;
        if (body.joinToken && !link) throw new ApiError(400, "invalid_link", "Ссылка регистрации недействительна — попросите новую");
        const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.login, body.login));
        if (taken) throw new ApiError(409, "login_taken", "Такой логин уже занят");

        const [user] = await db
          .insert(users)
          .values({
            login: body.login,
            fullName: body.fullName,
            passwordHash: await hashPassword(body.password),
            role: "student",
            status: "pending",
            groupId: link?.group.id ?? null,
            joinLinkId: link?.link.id ?? null,
            consentVersion: CONSENT_VERSION,
            consentAt: new Date(),
          })
          .onConflictDoNothing({ target: users.login })
          .returning();
        // одновременная регистрация с тем же логином
        if (!user) throw new ApiError(409, "login_taken", "Такой логин уже занят");
        const session = await createSession(db, user.id);
        setSessionCookie(c, session.token);
        return c.json(await toMe(db, user), 201);
      })

      .post("/auth/login", async (c) => {
        const db = c.var.db;
        const body = await parseBody(c, LoginBody);
        const key = `${clientIp(c)}|${body.login}`;
        if (!(await loginLimiter.take(db, key))) throw new ApiError(429, "rate_limited", "Слишком много попыток — подождите минуту");
        const [user] = await db.select().from(users).where(eq(users.login, body.login));
        if (!user) {
          await burnPasswordCheck(body.password);
          throw new ApiError(401, "bad_credentials", "Неверный логин или пароль");
        }
        if (!(await verifyPassword(user.passwordHash, body.password))) throw new ApiError(401, "bad_credentials", "Неверный логин или пароль");
        if (user.status === "blocked") throw new ApiError(403, "blocked", "Вход для этой учётной записи закрыт — обратитесь к преподавателю");
        await loginLimiter.reset(db, key);
        const session = await createSession(db, user.id);
        setSessionCookie(c, session.token);
        return c.json(await toMe(db, user));
      })

      .post("/auth/logout", async (c) => {
        if (c.var.sessionId) await deleteSession(c.var.db, c.var.sessionId);
        clearSessionCookie(c);
        return c.json({ ok: true });
      })

      .get("/me", async (c) => c.json(await toMe(c.var.db, requireUser(c, { allowTempPassword: true }))))

      /** Смена своего пароля. С временным паролем старый не спрашиваем. Остальные сессии завершаются. */
      .post("/me/password", async (c) => {
        const db = c.var.db;
        const user = requireUser(c, { allowTempPassword: true });
        const body = await parseBody(c, PasswordBody);
        if (!user.mustChangePassword && !(await verifyPassword(user.passwordHash, body.oldPassword ?? ""))) throw new ApiError(400, "bad_password", "Текущий пароль указан неверно");
        await db
          .update(users)
          .set({
            passwordHash: await hashPassword(body.newPassword),
            mustChangePassword: false,
          })
          .where(eq(users.id, user.id));
        await deleteUserSessions(db, user.id, c.var.sessionId ?? undefined);
        return c.json(await toMe(db, { ...user, mustChangePassword: false }));
      })

      /** Группа по ссылке регистрации — для формы. */
      .get("/join/:token", async (c) => {
        const found = await findJoinLink(c.var.db, c.req.param("token"));
        if (!found) throw new ApiError(404, "invalid_link", "Ссылка регистрации недействительна — попросите новую");
        return c.json({ group: found.group } satisfies JoinInfo);
      })
  );
}
