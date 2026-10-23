import { Hono } from "hono";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { ResetPasswordBody, UsersPatch, UsersQuery, type UserDetail, UserEditBody, UserMergeBody } from "../../../../../shared/api";
import { toServerResult, userResults, userStats } from "../results";
import { deleteUserSessions, generatePassword, hashPassword } from "../../auth";
import { attempts, groups, results, users } from "../../db/schema";
import { ApiError, parseBody, requireStaff, type AppEnv } from "../../http";

import { assertGroupAccess, audit, toAdminUser, visibleUsers } from "./access";

export const usersRoutes = new Hono<AppEnv>()
  .get("/users", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const q = UsersQuery.parse(c.req.query());
    const where = and(
      await visibleUsers(db, staff),
      q.status ? eq(users.status, q.status) : undefined,
      q.role ? eq(users.role, q.role) : undefined,
      q.group === "none" ? isNull(users.groupId) : q.group !== undefined ? eq(users.groupId, q.group) : undefined,
      q.q ? or(ilike(users.fullName, `%${q.q}%`), ilike(users.login, `%${q.q}%`)) : undefined,
    );
    const rows = await db
      .select({ user: users, group: { id: groups.id, name: groups.name } })
      .from(users)
      .leftJoin(groups, eq(groups.id, users.groupId))
      .where(where)
      // неподтверждённые — сверху, потом свежие
      .orderBy(sql`case when ${users.status} = 'pending' then 0 else 1 end`, desc(users.createdAt))
      .limit(2000);
    return c.json(rows.map((r) => toAdminUser(r.user, r.group?.id ? r.group : null)));
  })

  /** Карточка пользователя: данные, результаты, сводка. */
  .get("/users/:id", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = Number(c.req.param("id"));
    const [row] = await db
      .select({ user: users, group: { id: groups.id, name: groups.name } })
      .from(users)
      .leftJoin(groups, eq(groups.id, users.groupId))
      .where(and(eq(users.id, id), await visibleUsers(db, staff)));
    if (!row) throw new ApiError(404, "not_found", "Пользователь не найден");
    const rows = await userResults(db, id);
    return c.json({
      user: toAdminUser(row.user, row.group?.id ? row.group : null),
      results: rows.map(toServerResult),
      stats: userStats(rows),
    } satisfies UserDetail);
  })

  /** Массовое изменение выделенных пользователей. */
  .patch("/users", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const { ids, set } = await parseBody(c, UsersPatch);
    if (set.role && staff.role !== "admin") throw new ApiError(403, "forbidden", "Роли назначает только администратор");
    if (ids.includes(staff.id) && (set.role || set.status)) throw new ApiError(400, "self", "Свою роль и статус поменять нельзя — попросите другого администратора");
    if (set.groupId != null) await assertGroupAccess(db, staff, set.groupId);
    const allowed = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, ids), await visibleUsers(db, staff)));
    if (allowed.length !== new Set(ids).size) throw new ApiError(403, "forbidden", "Среди выбранных есть недоступные вам пользователи");
    await db.update(users).set(set).where(inArray(users.id, ids));
    // заблокированного выкидываем сразу
    if (set.status === "blocked") await Promise.all(ids.map((id) => deleteUserSessions(db, id)));
    await audit(db, staff.id, "users.update", { ids, set });
    return c.json({ updated: ids.length });
  })

  /** Изменить ФИО пользователя. */
  .patch("/users/:id", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = Number(c.req.param("id"));
    const body = await parseBody(c, UserEditBody);
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), await visibleUsers(db, staff)));
    if (!target) throw new ApiError(404, "not_found", "Пользователь не найден");
    await db.update(users).set({ fullName: body.fullName }).where(eq(users.id, id));
    await audit(db, staff.id, "users.rename", { id, fullName: body.fullName });
    return c.json({ ok: true });
  })

  /** Удалить пользователя вместе с его сессиями и результатами. Себя — нельзя. */
  .delete("/users/:id", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = Number(c.req.param("id"));
    if (id === staff.id) throw new ApiError(400, "self", "Себя удалить нельзя");
    const [target] = await db
      .select({ id: users.id, login: users.login, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.id, id), await visibleUsers(db, staff)));
    if (!target) throw new ApiError(404, "not_found", "Пользователь не найден");
    await db.delete(users).where(eq(users.id, id));
    await audit(db, staff.id, "users.delete", target);
    return c.json({ ok: true });
  })

  /** Объединить дубль: результаты и попытки переходят к `intoId`, исходная запись удаляется. */
  .post("/users/:id/merge", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = Number(c.req.param("id"));
    const { intoId } = await parseBody(c, UserMergeBody);
    if (id === intoId) throw new ApiError(400, "self", "Выберите другого пользователя");
    if (id === staff.id) throw new ApiError(400, "self", "Себя объединить нельзя");
    const found = await db
      .select({ id: users.id, login: users.login, fullName: users.fullName })
      .from(users)
      .where(and(inArray(users.id, [id, intoId]), await visibleUsers(db, staff)));
    const from = found.find((u) => u.id === id);
    if (!from || !found.some((u) => u.id === intoId)) throw new ApiError(404, "not_found", "Пользователь не найден");
    await db.transaction(async (tx) => {
      await tx.update(results).set({ userId: intoId }).where(eq(results.userId, id));
      await tx.update(attempts).set({ userId: intoId }).where(eq(attempts.userId, id));
      await tx.delete(users).where(eq(users.id, id));
    });
    await audit(db, staff.id, "users.merge", { from, intoId });
    return c.json({ ok: true });
  })

  /** Сброс пароля: задать вручную или сгенерировать; при входе потребуется сменить. */
  .post("/users/:id/reset-password", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = Number(c.req.param("id"));
    const body = await parseBody(c, ResetPasswordBody);
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), await visibleUsers(db, staff)));
    if (!target) throw new ApiError(404, "not_found", "Пользователь не найден");
    const password = body.password ?? generatePassword();
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
      })
      .where(eq(users.id, id));
    await deleteUserSessions(db, id);
    await audit(db, staff.id, "users.reset_password", { id });
    return c.json({ password });
  });
