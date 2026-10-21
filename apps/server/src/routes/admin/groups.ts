import { Hono } from "hono";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  GroupBody,
  LinkBody,
  type AdminGroup,
} from "../../../../../shared/api";
import { randomToken } from "../../auth";
import { groupTeachers, groups, joinLinks, users } from "../../db/schema";
import {
  ApiError,
  parseBody,
  requireAdmin,
  requireStaff,
  type AppEnv,
} from "../../http";

import {
  assertGroupAccess,
  audit,
  loadLinkFor,
  ownGroupIds,
  toLink,
} from "./access";

export const groupsRoutes = new Hono<AppEnv>()
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
  });
