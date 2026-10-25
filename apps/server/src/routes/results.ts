import { Hono, type Context } from "hono";
import { and, asc, count, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { DeleteResultsBody, ResultsQuery, type ResultListItem, type ResultsFilters, type ResultsPage, type ServerResult, type UserStats } from "../../../../shared/api";
import type { Db } from "../db";
import { attempts, auditLog, events, groups, results, users } from "../db/schema";
import { ApiError, parseBody, requireStaff, requireUser, type AppEnv, type UserRow } from "../http";
import { ownGroupIds, visibleUsers } from "./admin";
import { queryResultsStats } from "../results-stats-sql";

/** Удалить результаты вместе с их попытками (зачётная попытка мероприятия освобождается). Админ — любые; преподаватель — студентов своих групп и без группы. */
async function deleteResults(c: Context<AppEnv>, ids: number[]) {
  const db = c.var.db;
  const staff = requireStaff(c);
  const unique = [...new Set(ids)];
  const visible = staff.role === "admin" ? undefined : await visibleUsers(db, staff);
  const rows = await db
    .select({ id: results.id, attemptId: results.attemptId })
    .from(results)
    .innerJoin(users, eq(users.id, results.userId))
    .where(and(inArray(results.id, unique), visible ? or(eq(results.userId, staff.id), visible) : undefined));
  if (rows.length !== unique.length) throw new ApiError(403, "forbidden", "Часть результатов не найдена или принадлежит студентам не из ваших групп");
  const attemptIds = rows.flatMap((r) => (r.attemptId ? [r.attemptId] : []));
  await db.delete(results).where(inArray(results.id, unique));
  if (attemptIds.length) await db.delete(attempts).where(inArray(attempts.id, attemptIds));
  await db.insert(auditLog).values({ userId: staff.id, action: "results.delete", payload: { ids: unique } });
  return c.json({ deleted: unique.length });
}

type ResultRow = typeof results.$inferSelect;

export const toServerResult = (r: ResultRow): ServerResult => ({
  id: r.id,
  caseId: r.caseId,
  caseNumber: r.caseNumber,
  caseTitle: r.caseTitle,
  total: r.total,
  max: r.max,
  hintsUsed: r.hintsUsed,
  wrongDeductions: r.wrongDeductions,
  elapsedMs: r.elapsedMs,
  score: r.score,
  input: r.input,
  caseConfigVersion: r.caseConfigVersion,
  gameVersion: r.gameVersion,
  resultFormatVersion: r.resultFormatVersion,
  finishedAt: r.finishedAt.toISOString(),
});

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

export function userStats(rows: ResultRow[]): UserStats {
  const percents = rows.filter((r) => r.max > 0).map((r) => Math.min(100, (r.total / r.max) * 100));
  return {
    attempts: rows.length,
    cases: new Set(rows.map((r) => r.caseId)).size,
    avgPercent: avg(percents),
    bestPercent: percents.length ? Math.round(Math.max(...percents)) : null,
    avgHints: avg(rows.map((r) => r.hintsUsed)),
    avgWrongDeductions: avg(rows.map((r) => r.wrongDeductions)),
    avgMinutes: avg(rows.flatMap((r) => (r.elapsedMs == null ? [] : [r.elapsedMs / 60_000]))),
    lastAt: rows.length ? rows.reduce((a, r) => (r.finishedAt > a ? r.finishedAt : a), rows[0].finishedAt).toISOString() : null,
  };
}

/** Ячейка CSV: кавычки удваиваются; значения, которые Excel принял бы за формулу, получают апостроф. */
export const csvCell = (v: string | number | null): string => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const CSV_HEAD = ["ФИО", "Логин", "Группа", "Дело №", "Дело", "Баллы", "Максимум", "Процент", "Подсказок", "Ошибок", "Минут", "Источник", "Мероприятие", "Дата"];

export const userResults = (db: AppEnv["Variables"]["db"], userId: number) => db.select().from(results).where(eq(results.userId, userId)).orderBy(desc(results.finishedAt)).limit(500);

/**
 * Какие прохождения видит пользователь: студент — только свои; преподаватель — свои и студентов
 * своих групп и без группы; администратор — все. Плюс фильтры по делу, группе, пользователю.
 */
async function resultsWhere(db: Db, viewer: UserRow, q: ReturnType<typeof ResultsQuery.parse>): Promise<SQL | undefined> {
  const byCase = q.case ? eq(results.caseId, q.case) : undefined;
  const byEvent = q.event === "none" ? isNull(results.eventId) : q.event !== undefined ? eq(results.eventId, q.event) : undefined;
  if (viewer.role === "student") return and(eq(results.userId, viewer.id), byCase, byEvent);
  const visible = await visibleUsers(db, viewer);
  return and(
    visible ? or(eq(results.userId, viewer.id), visible) : undefined,
    byCase,
    q.group === "none" ? isNull(users.groupId) : q.group !== undefined ? eq(users.groupId, q.group) : undefined,
    q.user === "me" ? eq(results.userId, viewer.id) : q.user !== undefined ? eq(results.userId, q.user) : undefined,
    byEvent,
  );
}

/** Результаты. Записывает их только судья (`POST /cases/:id/finish`): присланные браузером баллы сервер не принимает. */
export const resultRoutes = new Hono<AppEnv>()
  .get("/me/results", async (c) => {
    const user = requireUser(c);
    return c.json((await userResults(c.var.db, user.id)).map(toServerResult));
  })

  /** Прохождения с фильтрами и пагинацией (страница «Результаты»). */
  .get("/results", async (c) => {
    const db = c.var.db;
    const viewer = requireUser(c);
    const q = ResultsQuery.parse(c.req.query());
    const where = await resultsWhere(db, viewer, q);
    const [{ n }] = await db.select({ n: count() }).from(results).innerJoin(users, eq(users.id, results.userId)).where(where);
    const rows = await db
      .select({ r: results, u: { id: users.id, fullName: users.fullName, login: users.login }, g: { id: groups.id, name: groups.name }, e: { id: events.id, title: events.title } })
      .from(results)
      .innerJoin(users, eq(users.id, results.userId))
      .leftJoin(groups, eq(groups.id, users.groupId))
      .leftJoin(events, eq(events.id, results.eventId))
      .where(where)
      .orderBy(desc(results.finishedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const items: ResultListItem[] = rows.map(({ r, u, g, e }) => ({ ...toServerResult(r), user: { ...u, group: g?.id ? g : null }, event: e?.id ? e : null }));
    return c.json({ items, total: n, page: q.page, pageSize: q.pageSize } satisfies ResultsPage);
  })

  /** Выгрузка выбранных прохождений в CSV (разделитель «;», UTF-8 с BOM — открывается в Excel). Только персоналу. */
  .get("/results/export.csv", async (c) => {
    const db = c.var.db;
    const viewer = requireStaff(c);
    const q = ResultsQuery.parse(c.req.query());
    const rows = await db
      .select({ r: results, u: { fullName: users.fullName, login: users.login }, g: { name: groups.name }, e: { title: events.title } })
      .from(results)
      .innerJoin(users, eq(users.id, results.userId))
      .leftJoin(groups, eq(groups.id, users.groupId))
      .leftJoin(events, eq(events.id, results.eventId))
      .where(await resultsWhere(db, viewer, q))
      .orderBy(desc(results.finishedAt))
      .limit(50_000);
    const lines = [
      CSV_HEAD,
      ...rows.map(({ r, u, g, e }) => [
        u.fullName,
        u.login,
        g?.name ?? "",
        r.caseNumber,
        r.caseTitle,
        r.total,
        r.max,
        r.max > 0 ? Math.round((r.total / r.max) * 100) : "",
        r.hintsUsed,
        r.wrongDeductions,
        r.elapsedMs == null ? "" : Math.round(r.elapsedMs / 600) / 100,
        r.source === "server" ? "сервер" : r.source === "offline" ? "офлайн" : "клиентский",
        e?.title ?? "",
        r.finishedAt.toISOString(),
      ]),
    ];
    const body = "\uFEFF" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n") + "\r\n";
    return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="results.csv"' } });
  })

  /** Аналитика по той же выборке (без пагинации). */
  .get("/results/stats", async (c) => {
    const db = c.var.db;
    const viewer = requireUser(c);
    const q = ResultsQuery.parse(c.req.query());
    return c.json(await queryResultsStats(db, await resultsWhere(db, viewer, q)));
  })

  /** Что можно выбрать в фильтрах. */
  .get("/results/filters", async (c) => {
    const db = c.var.db;
    const viewer = requireUser(c);
    const where = await resultsWhere(db, viewer, ResultsQuery.parse({}));
    const cases = await db
      .selectDistinct({ id: results.caseId, number: results.caseNumber, title: results.caseTitle })
      .from(results)
      .innerJoin(users, eq(users.id, results.userId))
      .where(where)
      .orderBy(asc(results.caseNumber));
    const eventList = await db
      .selectDistinct({ id: events.id, title: events.title })
      .from(results)
      .innerJoin(users, eq(users.id, results.userId))
      .innerJoin(events, eq(events.id, results.eventId))
      .where(where)
      .orderBy(desc(events.id));
    if (viewer.role === "student") return c.json({ cases, groups: [], users: [], events: eventList } satisfies ResultsFilters);
    const own = viewer.role === "admin" ? null : await ownGroupIds(db, viewer.id);
    const groupList = await db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(own ? (own.length ? inArray(groups.id, own) : eq(groups.id, -1)) : undefined)
      .orderBy(asc(groups.name));
    const visible = await visibleUsers(db, viewer);
    const userList = await db
      .select({ id: users.id, fullName: users.fullName, group: groups.name })
      .from(users)
      .leftJoin(groups, eq(groups.id, users.groupId))
      .where(and(visible, eq(users.role, "student")))
      .orderBy(asc(users.fullName))
      .limit(5000);
    return c.json({ cases, groups: groupList, users: userList, events: eventList } satisfies ResultsFilters);
  })
  /** Удаление результатов (персонал): пачкой или одного. */
  .post("/results/delete", async (c) => deleteResults(c, (await parseBody(c, DeleteResultsBody)).ids))
  .delete("/results/:id", async (c) => deleteResults(c, [Number(c.req.param("id"))]));
