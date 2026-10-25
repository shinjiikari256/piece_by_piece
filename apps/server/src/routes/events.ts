import { Hono } from "hono";
import { and, asc, count, eq, inArray, or } from "drizzle-orm";
import { EventBody, ParticipantsQuery, type EventParticipant, type EventParticipants, type ParticipantStatus, type ServerEvent } from "../../../../shared/api";
import type { CaseFile } from "../../../../shared/case";
import type { Db } from "../db";
import { attempts, caseVersions, cases, eventAccess, eventCases, events, groups, results, users } from "../db/schema";
import { ApiError, parseBody, requireStaff, requireUser, type AppEnv } from "../http";
import { ownGroupIds, visibleUsers } from "./admin";

type EventRow = typeof events.$inferSelect;

export const isOpen = (e: Pick<EventRow, "opensAt" | "closesAt">, now = new Date()) => (!e.opensAt || e.opensAt <= now) && (!e.closesAt || now < e.closesAt);

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
  const bestRows = userId
    ? await db.select({ eventId: results.eventId, caseId: results.caseId, total: results.total, max: results.max }).from(results).where(and(eq(results.userId, userId), inArray(results.eventId, ids)))
    : [];
  const best = (eventId: number) => {
    const out: Record<string, { total: number; max: number }> = {};
    for (const b of bestRows) {
      if (b.eventId !== eventId) continue;
      const cur = out[b.caseId];
      if (!cur || b.total > cur.total) out[b.caseId] = { total: b.total, max: b.max };
    }
    return out;
  };
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    opensAt: r.opensAt?.toISOString() ?? null,
    closesAt: r.closesAt?.toISOString() ?? null,
    debriefPolicy: r.debriefPolicy,
    maxScoredAttempts: r.maxScoredAttempts,
    caseIds: cs
      .filter((x) => x.eventId === r.id)
      .map((x) => x.caseId)
      .sort(),
    groupIds: gs
      .filter((x) => x.eventId === r.id)
      .map((x) => x.groupId)
      .sort((a, b) => a - b),
    open: isOpen(r),
    ...(userId ? { doneByCase: Object.fromEntries(done.filter((d) => d.eventId === r.id).map((d) => [d.caseId, d.n])), bestByCase: best(r.id) } : {}),
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
      rows = await db
        .select()
        .from(events)
        .where(ids.length ? or(eq(events.createdBy, user.id), inArray(events.id, ids)) : eq(events.createdBy, user.id));
    } else {
      if (!user.groupId) return c.json([]);
      const ids = (await db.select({ id: eventAccess.eventId }).from(eventAccess).where(eq(eventAccess.groupId, user.groupId))).map((x) => x.id);
      rows = ids.length ? await db.select().from(events).where(inArray(events.id, ids)) : [];
    }
    rows.sort((a, b) => b.id - a.id);
    return c.json(await describe(db, rows, user.role === "student" ? user.id : undefined));
  })
  /** Участники мероприятия и их прохождение дел (только персонал; преподаватель видит студентов своих групп и без группы). */
  .get("/admin/events/:id/participants", async (c) => {
    const staff = requireStaff(c);
    const db = c.var.db;
    const id = Number(c.req.param("id"));
    const [row] = Number.isInteger(id) ? await db.select().from(events).where(eq(events.id, id)) : [];
    if (!row) throw new ApiError(404, "not_found", "Мероприятие не найдено");
    const [event] = await describe(db, [row]);
    if (staff.role !== "admin") {
      const own = await ownGroupIds(db, staff.id);
      if (row.createdBy !== staff.id && !event.groupIds.some((g) => own.includes(g))) throw new ApiError(403, "forbidden", "Это не ваше мероприятие");
    }
    const q = ParticipantsQuery.parse(c.req.query());
    const caseBodies = event.caseIds.length
      ? await db
          .select({ id: cases.id, body: caseVersions.body })
          .from(cases)
          .innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId))
          .where(inArray(cases.id, event.caseIds))
      : [];
    const caseRows = caseBodies
      .map(({ id: caseId, body }) => ({ id: caseId, number: String((body as CaseFile).number), title: (body as CaseFile).title }))
      .sort((a, b) => a.number.localeCompare(b.number, "ru", { numeric: true }));
    const groupRows = event.groupIds.length ? await db.select({ id: groups.id, name: groups.name }).from(groups).where(inArray(groups.id, event.groupIds)).orderBy(asc(groups.name)) : [];
    const visible = await visibleUsers(db, staff);
    const students = event.groupIds.length
      ? await db
          .select({ id: users.id, fullName: users.fullName, login: users.login, groupId: users.groupId })
          .from(users)
          .where(and(eq(users.role, "student"), inArray(users.groupId, event.groupIds), visible))
          .orderBy(asc(users.fullName))
      : [];
    const ids = students.map((u) => u.id);
    const att = ids.length
      ? await db
          .select({ userId: attempts.userId, caseId: attempts.caseId, status: attempts.status, n: count() })
          .from(attempts)
          .where(and(eq(attempts.eventId, id), inArray(attempts.userId, ids), inArray(attempts.status, ["active", "finished"])))
          .groupBy(attempts.userId, attempts.caseId, attempts.status)
      : [];
    const res = ids.length
      ? await db
          .select({ userId: results.userId, caseId: results.caseId, total: results.total, max: results.max, elapsedMs: results.elapsedMs })
          .from(results)
          .where(and(eq(results.eventId, id), inArray(results.userId, ids)))
      : [];
    const items: EventParticipant[] = students.map((u) => {
      const cs: EventParticipant["cases"] = {};
      for (const caseId of event.caseIds) {
        const done = att.find((a) => a.userId === u.id && a.caseId === caseId && a.status === "finished")?.n ?? 0;
        const active = att.some((a) => a.userId === u.id && a.caseId === caseId && a.status === "active");
        let best: EventParticipant["cases"][string]["best"] = null;
        let elapsedMs: number | null = null;
        for (const r of res) {
          if (r.userId !== u.id || r.caseId !== caseId) continue;
          if (!best || r.total > best.total) {
            best = { total: r.total, max: r.max };
            elapsedMs = r.elapsedMs;
          }
        }
        cs[caseId] = { status: done > 0 ? "done" : active ? "active" : "none", done, best, elapsedMs };
      }
      const all = Object.values(cs);
      const status: ParticipantStatus = all.length && all.every((x) => x.status === "done") ? "done" : all.every((x) => x.status === "none") ? "none" : "active";
      const g = groupRows.find((x) => x.id === u.groupId);
      return { user: { id: u.id, fullName: u.fullName, login: u.login, group: g ?? null }, status, cases: cs };
    });
    const needle = q.q?.toLowerCase();
    const filtered = items.filter((p) => {
      if (q.group !== undefined && p.user.group?.id !== q.group) return false;
      if (needle && !p.user.fullName.toLowerCase().includes(needle) && !p.user.login.toLowerCase().includes(needle)) return false;
      if (q.status && (q.case ? (p.cases[q.case]?.status ?? "none") : p.status) !== q.status) return false;
      return true;
    });
    return c.json({ event, cases: caseRows, groups: groupRows, items: filtered } satisfies EventParticipants);
  })
  .post("/admin/events", async (c) => {
    const staff = requireStaff(c);
    const body = await parseBody(c, EventBody);
    await checkRefs(c.var.db, staff, body);
    const [row] = await c.var.db
      .insert(events)
      .values({ ...fields(body), createdBy: staff.id })
      .returning();
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
