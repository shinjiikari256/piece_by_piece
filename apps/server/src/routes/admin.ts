import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  GroupBody,
  LinkBody,
  ResetPasswordBody,
  SettingsBody,
  UsersPatch,
  UsersQuery,
  type AdminGroup,
  type AdminUser,
  type JoinLink,
  type Settings,
  type UserDetail,
  UserEditBody,
  UserMergeBody,
} from "../../../../shared/api";
import { toServerResult, userResults, userStats } from "./results";
import {
  deleteUserSessions,
  generatePassword,
  hashPassword,
  randomToken,
} from "../auth";
import type { Db } from "../db";
import {
  attempts,
  auditLog,
  groupTeachers,
  groups,
  joinLinks,
  results,
  users,
} from "../db/schema";
import {
  ApiError,
  getSetting,
  parseBody,
  putSetting,
  requireAdmin,
  requireStaff,
  userCore,
  type AppEnv,
  type UserRow,
} from "../http";

/**
 * Права:
 * - администратор — всё;
 * - преподаватель — студенты своих групп и студенты без группы (чтобы забрать их к себе):
 *   статус, группа (только своя или «без группы»), сброс пароля; ссылки своих групп. Роли — нет.
 */

export async function ownGroupIds(db: Db, teacherId: number): Promise<number[]> {
  const rows = await db
    .select({ id: groupTeachers.groupId })
    .from(groupTeachers)
    .where(eq(groupTeachers.userId, teacherId));
  return rows.map((r) => r.id);
}

/** Условие «пользователь виден этому сотруднику». */
export async function visibleUsers(db: Db, staff: UserRow): Promise<SQL | undefined> {
  if (staff.role === "admin") return undefined;
  const own = await ownGroupIds(db, staff.id);
  return and(
    eq(users.role, "student"),
    own.length
      ? or(isNull(users.groupId), inArray(users.groupId, own))
      : isNull(users.groupId),
  );
}

async function assertGroupAccess(db: Db, staff: UserRow, groupId: number) {
  const [g] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.id, groupId));
  if (!g) throw new ApiError(404, "not_found", "Группа не найдена");
  if (
    staff.role !== "admin" &&
    !(await ownGroupIds(db, staff.id)).includes(groupId)
  )
    throw new ApiError(403, "forbidden", "Это не ваша группа");
}

/** Ссылка по id; 404, если её нет, и 403, если группа чужая. */
async function loadLinkFor(db: Db, staff: UserRow, id: number) {
  const [link] = await db.select().from(joinLinks).where(eq(joinLinks.id, id));
  if (!link) throw new ApiError(404, "not_found", "Ссылка не найдена");
  await assertGroupAccess(db, staff, link.groupId);
  return link;
}

const audit = (db: Db, userId: number, action: string, payload: unknown) =>
  db.insert(auditLog).values({ userId, action, payload });

const toAdminUser = (
  u: UserRow,
  group: { id: number; name: string } | null,
): AdminUser => ({
  ...userCore(u, group),
  createdAt: u.createdAt.toISOString(),
  viaLink: u.joinLinkId !== null,
});

const toLink = (
  l: typeof joinLinks.$inferSelect,
  registered = 0,
  pending = 0,
): JoinLink => ({
  id: l.id,
  groupId: l.groupId,
  token: l.token,
  expiresAt: l.expiresAt?.toISOString() ?? null,
  revokedAt: l.revokedAt?.toISOString() ?? null,
  createdAt: l.createdAt.toISOString(),
  registered,
  pending,
});

export const adminRoutes = new Hono<AppEnv>()
  // ---------- Пользователи ----------
  .get("/users", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const q = UsersQuery.parse(c.req.query());
    const where = and(
      await visibleUsers(db, staff),
      q.status ? eq(users.status, q.status) : undefined,
      q.role ? eq(users.role, q.role) : undefined,
      q.group === "none"
        ? isNull(users.groupId)
        : q.group !== undefined
          ? eq(users.groupId, q.group)
          : undefined,
      q.q
        ? or(ilike(users.fullName, `%${q.q}%`), ilike(users.login, `%${q.q}%`))
        : undefined,
    );
    const rows = await db
      .select({ user: users, group: { id: groups.id, name: groups.name } })
      .from(users)
      .leftJoin(groups, eq(groups.id, users.groupId))
      .where(where)
      // неподтверждённые — сверху, потом свежие
      .orderBy(
        sql`case when ${users.status} = 'pending' then 0 else 1 end`,
        desc(users.createdAt),
      )
      .limit(2000);
    return c.json(
      rows.map((r) => toAdminUser(r.user, r.group?.id ? r.group : null)),
    );
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
    if (set.role && staff.role !== "admin")
      throw new ApiError(
        403,
        "forbidden",
        "Роли назначает только администратор",
      );
    if (ids.includes(staff.id) && (set.role || set.status))
      throw new ApiError(
        400,
        "self",
        "Свою роль и статус поменять нельзя — попросите другого администратора",
      );
    if (set.groupId != null) await assertGroupAccess(db, staff, set.groupId);
    const allowed = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, ids), await visibleUsers(db, staff)));
    if (allowed.length !== new Set(ids).size)
      throw new ApiError(
        403,
        "forbidden",
        "Среди выбранных есть недоступные вам пользователи",
      );
    await db.update(users).set(set).where(inArray(users.id, ids));
    // заблокированного выкидываем сразу
    if (set.status === "blocked")
      await Promise.all(ids.map((id) => deleteUserSessions(db, id)));
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

  /** Скачать готовый офлайн-файл игры (путь — `OFFLINE_FILE`). */
  .get("/offline", async (c) => {
    requireStaff(c);
    const file = c.var.config.offlineFile;
    const data = file ? await readFile(file).catch(() => null) : null;
    if (!data) throw new ApiError(404, "not_found", "Офлайн-версия на сервере не подготовлена");
    return c.body(new Uint8Array(data), 200, {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": 'attachment; filename="delo.html"',
    });
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
  })

  // ---------- Группы ----------
  .get("/groups", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const own = staff.role === "admin" ? null : await ownGroupIds(db, staff.id);
    const list = await db
      .select()
      .from(groups)
      .where(
        own ? (own.length ? inArray(groups.id, own) : sql`false`) : undefined,
      )
      .orderBy(asc(groups.name));
    const teachers = await db.select().from(groupTeachers);
    const counts = await db
      .select({ groupId: users.groupId, status: users.status, n: count() })
      .from(users)
      .where(eq(users.role, "student"))
      .groupBy(users.groupId, users.status);
    const result: AdminGroup[] = list.map((g) => ({
      id: g.id,
      name: g.name,
      teacherIds: teachers
        .filter((t) => t.groupId === g.id)
        .map((t) => t.userId),
      students: counts
        .filter((x) => x.groupId === g.id)
        .reduce((s, x) => s + x.n, 0),
      pending:
        counts.find((x) => x.groupId === g.id && x.status === "pending")?.n ??
        0,
    }));
    return c.json(result);
  })

  .post("/groups", async (c) => {
    const db = c.var.db;
    const admin = requireAdmin(c);
    const body = await parseBody(c, GroupBody);
    const [g] = await db
      .insert(groups)
      .values({ name: body.name })
      .onConflictDoNothing()
      .returning();
    if (!g)
      throw new ApiError(
        409,
        "group_exists",
        "Группа с таким названием уже есть",
      );
    if (body.teacherIds?.length)
      await db
        .insert(groupTeachers)
        .values(body.teacherIds.map((userId) => ({ groupId: g.id, userId })));
    await audit(db, admin.id, "groups.create", { id: g.id, ...body });
    return c.json({ id: g.id, name: g.name }, 201);
  })

  .patch("/groups/:id", async (c) => {
    const db = c.var.db;
    const admin = requireAdmin(c);
    const id = Number(c.req.param("id"));
    const body = await parseBody(c, GroupBody);
    const [g] = await db
      .update(groups)
      .set({ name: body.name })
      .where(eq(groups.id, id))
      .returning()
      .catch(() => {
        throw new ApiError(
          409,
          "group_exists",
          "Группа с таким названием уже есть",
        );
      });
    if (!g) throw new ApiError(404, "not_found", "Группа не найдена");
    if (body.teacherIds) {
      await db.delete(groupTeachers).where(eq(groupTeachers.groupId, id));
      if (body.teacherIds.length)
        await db
          .insert(groupTeachers)
          .values(body.teacherIds.map((userId) => ({ groupId: id, userId })));
    }
    await audit(db, admin.id, "groups.update", { id, ...body });
    return c.json({ id: g.id, name: g.name });
  })

  /** Удаление группы: студенты остаются, но «без группы». */
  .delete("/groups/:id", async (c) => {
    const db = c.var.db;
    const admin = requireAdmin(c);
    const id = Number(c.req.param("id"));
    const [g] = await db.delete(groups).where(eq(groups.id, id)).returning();
    if (!g) throw new ApiError(404, "not_found", "Группа не найдена");
    await audit(db, admin.id, "groups.delete", { id, name: g.name });
    return c.json({ ok: true });
  })

  // ---------- Ссылки регистрации ----------
  .get("/groups/:id/links", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const groupId = Number(c.req.param("id"));
    await assertGroupAccess(db, staff, groupId);
    const links = await db
      .select()
      .from(joinLinks)
      .where(eq(joinLinks.groupId, groupId))
      .orderBy(desc(joinLinks.createdAt));
    const stats = links.length
      ? await db
          .select({
            linkId: users.joinLinkId,
            status: users.status,
            n: count(),
          })
          .from(users)
          .where(
            inArray(
              users.joinLinkId,
              links.map((l) => l.id),
            ),
          )
          .groupBy(users.joinLinkId, users.status)
      : [];
    return c.json(
      links.map((l) =>
        toLink(
          l,
          stats.filter((s) => s.linkId === l.id).reduce((n, s) => n + s.n, 0),
          stats.find((s) => s.linkId === l.id && s.status === "pending")?.n ??
            0,
        ),
      ),
    );
  })

  .post("/groups/:id/links", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const groupId = Number(c.req.param("id"));
    await assertGroupAccess(db, staff, groupId);
    const body = await parseBody(c, LinkBody);
    // без даты — бессрочная (пока не отозвана)
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    const [link] = await db
      .insert(joinLinks)
      .values({
        groupId,
        token: randomToken(12),
        expiresAt,
        createdBy: staff.id,
      })
      .returning();
    await audit(db, staff.id, "links.create", { id: link.id, groupId });
    return c.json(toLink(link), 201);
  })

  .post("/links/:id/revoke", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = Number(c.req.param("id"));
    await loadLinkFor(db, staff, id);
    await db
      .update(joinLinks)
      .set({ revokedAt: new Date() })
      .where(eq(joinLinks.id, id));
    await audit(db, staff.id, "links.revoke", { id });
    return c.json({ ok: true });
  })

  /** «Подтвердить всех из ссылки»: неподтверждённые, пришедшие по ней и всё ещё в её группе. */
  .post("/links/:id/confirm", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = Number(c.req.param("id"));
    const link = await loadLinkFor(db, staff, id);
    const confirmed = await db
      .update(users)
      .set({ status: "active" })
      .where(
        and(
          eq(users.joinLinkId, id),
          eq(users.groupId, link.groupId),
          eq(users.status, "pending"),
          eq(users.role, "student"),
        ),
      )
      .returning({ id: users.id });
    await audit(db, staff.id, "links.confirm", {
      id,
      users: confirmed.map((u) => u.id),
    });
    return c.json({ confirmed: confirmed.length });
  })

  // ---------- Настройки ----------
  .get("/settings", async (c) => {
    requireStaff(c);
    return c.json({
      registrationOpen: await getSetting(c.var.db, "registrationOpen", true),
    } satisfies Settings);
  })

  .put("/settings", async (c) => {
    const admin = requireAdmin(c);
    const body = await parseBody(c, SettingsBody);
    await putSetting(c.var.db, "registrationOpen", body.registrationOpen);
    await audit(c.var.db, admin.id, "settings.update", body);
    return c.json(body satisfies Settings);
  });
