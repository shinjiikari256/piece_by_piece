import { Hono } from "hono";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { EventBody, type ServerEvent } from "../../../../shared/api";
import type { Db } from "../db";
import { attempts, cases, eventAccess, eventCases, events, groups } from "../db/schema";
import { ApiError, parseBody, requireStaff, requireUser, type AppEnv } from "../http";
import { ownGroupIds } from "./admin";

type EventRow = typeof events.$inferSelect;

export const isOpen = (e: Pick<EventRow, "opensAt" | "closesAt">, now = new Date()) =>
  (!e.opensAt || e.opensAt <= now) && (!e.closesAt || now < e.closesAt);

async function describe(db: Db, rows: EventRow[], userId?: number): Promise<ServerEvent[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const cs = await db.select().from(eventCases).where(inArray(eventCases.eventId, ids));
  const gs = await db.select().from(eventAccess).where(inArray(eventAccess.eventId, ids));
  const done = userId
    ? await db
        .select({ eventId: attempts.eventId, caseId: attempts.caseId, n: count() })
        .from(attempts)
        .where(and(eq(attempts.userId, userId), eq(attempts.status, "finished"), inArray(attempts.eventId, ids)))
        .groupBy(attempts.eventId, attempts.caseId)
    : [];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    opensAt: r.opensAt?.toISOString() ?? null,
    closesAt: r.closesAt?.toISOString() ?? null,
    debriefPolicy: r.debriefPolicy,
    maxScoredAttempts: r.maxScoredAttempts,
    caseIds: cs.filter((x) => x.eventId === r.id).map((x) => x.caseId).sort(),
    groupIds: gs.filter((x) => x.eventId === r.id).map((x) => x.groupId).sort((a, b) => a - b),
    open: isOpen(r),
    ...(userId ? { doneByCase: Object.fromEntries(done.filter((d) => d.eventId === r.id).map((d) => [d.caseId, d.n])) } : {}),
  }));
}

/** Мероприятия видит студент своей группы; преподаватель — свои группы и созданные им, администратор — все. */
export const eventRoutes = new Hono<AppEnv>()
  .get("/events", async (c) => {
    const user = requireUser(c);
    const db = c.var.db;
    let rows: EventRow[];
    if (user.role === "admin") rows = await db.select().from(events);
    else if (user.role === "teacher") {
      const own = await ownGroupIds(db, user.id);
      const byGroup = own.length ? await db.select({ id: eventAccess.eventId }).from(eventAccess).where(inArray(eventAccess.groupId, own)) : [];
      const ids = byGroup.map((x) => x.id);
      rows = await db.select().from(events).where(ids.length ? or(eq(events.createdBy, user.id), inArray(events.id, ids)) : eq(events.createdBy, user.id));
    } else {
      if (!user.groupId) return c.json([]);
      const ids = (await db.select({ id: eventAccess.eventId }).from(eventAccess).where(eq(eventAccess.groupId, user.groupId))).map((x) => x.id);
      rows = ids.length ? await db.select().from(events).where(inArray(events.id, ids)) : [];
    }
    rows.sort((a, b) => b.id - a.id);
    return c.json(await describe(db, rows, user.role === "student" ? user.id : undefined));
  })
  .post("/admin/events", async (c) => {
    const staff = requireStaff(c);
    const body = await parseBody(c, EventBody);
    await checkRefs(c.var.db, staff, body);
    const [row] = await c.var.db.insert(events).values({ ...fields(body), createdBy: staff.id }).returning();
    await setLinks(c.var.db, row.id, body);
    return c.json((await describe(c.var.db, [row]))[0], 201);
  })
  .put("/admin/events/:id", async (c) => {
    const staff = requireStaff(c);
    const row = await editable(c.var.db, staff, Number(c.req.param("id")));
    const body = await parseBody(c, EventBody);
    await checkRefs(c.var.db, staff, body);
    const [next] = await c.var.db.update(events).set(fields(body)).where(eq(events.id, row.id)).returning();
    await setLinks(c.var.db, row.id, body);
    return c.json((await describe(c.var.db, [next]))[0]);
  })
  .delete("/admin/events/:id", async (c) => {
    const staff = requireStaff(c);
    const row = await editable(c.var.db, staff, Number(c.req.param("id")));
    await c.var.db.delete(events).where(eq(events.id, row.id));
    return c.json({ ok: true });
  });

const fields = (b: EventBody) => ({
  title: b.title,
  opensAt: b.opensAt ? new Date(b.opensAt) : null,
  closesAt: b.closesAt ? new Date(b.closesAt) : null,
  debriefPolicy: b.debriefPolicy,
  maxScoredAttempts: b.maxScoredAttempts,
});

/** Преподаватель правит только свои мероприятия. */
async function editable(db: Db, staff: { id: number; role: string }, id: number): Promise<EventRow> {
  const [row] = Number.isInteger(id) ? await db.select().from(events).where(eq(events.id, id)) : [];
  if (!row) throw new ApiError(404, "not_found", "Мероприятие не найдено");
  if (staff.role !== "admin" && row.createdBy !== staff.id) throw new ApiError(403, "forbidden", "Это не ваше мероприятие");
  return row;
}

async function checkRefs(db: Db, staff: { id: number; role: string }, b: EventBody) {
  if (b.opensAt && b.closesAt && new Date(b.closesAt) <= new Date(b.opensAt)) throw new ApiError(400, "invalid", "Закрытие должно быть позже открытия");
  const found = await db.select({ id: cases.id }).from(cases).where(inArray(cases.id, b.caseIds));
  if (found.length !== new Set(b.caseIds).size) throw new ApiError(400, "invalid", "Есть неизвестное дело");
  if (b.groupIds.length) {
    const g = await db.select({ id: groups.id }).from(groups).where(inArray(groups.id, b.groupIds));
    if (g.length !== new Set(b.groupIds).size) throw new ApiError(400, "invalid", "Есть неизвестная группа");
    if (staff.role !== "admin") {
      const own = await ownGroupIds(db, staff.id);
      if (b.groupIds.some((x) => !own.includes(x))) throw new ApiError(403, "forbidden", "Это не ваша группа");
    }
  }
}

async function setLinks(db: Db, id: number, b: EventBody) {
  await db.delete(eventCases).where(eq(eventCases.eventId, id));
  await db.delete(eventAccess).where(eq(eventAccess.eventId, id));
  await db.insert(eventCases).values([...new Set(b.caseIds)].map((caseId) => ({ eventId: id, caseId })));
  if (b.groupIds.length) await db.insert(eventAccess).values([...new Set(b.groupIds)].map((groupId) => ({ eventId: id, groupId })));
}
