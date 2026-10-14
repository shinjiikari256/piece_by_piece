import { Hono } from "hono";
import { and, asc, count, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import {
  ResultBody,
  ResultsQuery,
  type ResultListItem,
  type ResultsFilters,
  type ResultsPage,
  type ServerResult,
  type UserStats,
} from "../../../../shared/api";
import type { Db } from "../db";
import { groups, results, users } from "../db/schema";
import { parseBody, requireUser, type AppEnv, type UserRow } from "../http";
import { ownGroupIds, visibleUsers } from "./admin";
import { resultsStats } from "../../../../shared/results-stats";

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
  const percents = rows.filter((r) => r.max > 0).map((r) => (r.total / r.max) * 100);
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

export const userResults = (db: AppEnv["Variables"]["db"], userId: number) =>
  db.select().from(results).where(eq(results.userId, userId)).orderBy(desc(results.finishedAt)).limit(500);

/**
 * Какие прохождения видит пользователь: студент — только свои; преподаватель — свои и студентов
 * своих групп и без группы; администратор — все. Плюс фильтры по делу, группе, пользователю.
 */
async function resultsWhere(db: Db, viewer: UserRow, q: ReturnType<typeof ResultsQuery.parse>): Promise<SQL | undefined> {
  const byCase = q.case ? eq(results.caseId, q.case) : undefined;
  if (viewer.role === "student") return and(eq(results.userId, viewer.id), byCase);
  const visible = await visibleUsers(db, viewer);
  return and(
    visible ? or(eq(results.userId, viewer.id), visible) : undefined,
    byCase,
    q.group === "none" ? isNull(users.groupId) : q.group !== undefined ? eq(users.groupId, q.group) : undefined,
    q.user === "me" ? eq(results.userId, viewer.id) : q.user !== undefined ? eq(results.userId, q.user) : undefined,
  );
}

/** Свои результаты: сохранить после сдачи дела и посмотреть список. */
export const resultRoutes = new Hono<AppEnv>()
  .post("/me/results", async (c) => {
    const user = requireUser(c);
    const body = await parseBody(c, ResultBody);
    const [row] = await c.var.db
      .insert(results)
      .values({ ...body, userId: user.id, finishedAt: new Date(body.finishedAt), source: "client" })
      .returning();
    return c.json(toServerResult(row), 201);
  })
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
      .select({ r: results, u: { id: users.id, fullName: users.fullName, login: users.login }, g: { id: groups.id, name: groups.name } })
      .from(results)
      .innerJoin(users, eq(users.id, results.userId))
      .leftJoin(groups, eq(groups.id, users.groupId))
      .where(where)
      .orderBy(desc(results.finishedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const items: ResultListItem[] = rows.map(({ r, u, g }) => ({ ...toServerResult(r), user: { ...u, group: g?.id ? g : null } }));
    return c.json({ items, total: n, page: q.page, pageSize: q.pageSize } satisfies ResultsPage);
  })

  /** Аналитика по той же выборке (без пагинации). */
  .get("/results/stats", async (c) => {
    const db = c.var.db;
    const viewer = requireUser(c);
    const q = ResultsQuery.parse(c.req.query());
    const rows = await db
      .select({ r: results })
      .from(results)
      .innerJoin(users, eq(users.id, results.userId))
      .where(await resultsWhere(db, viewer, q))
      .limit(20_000);
    return c.json(resultsStats(rows.map((x) => x.r)));
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
    if (viewer.role === "student") return c.json({ cases, groups: [], users: [] } satisfies ResultsFilters);
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
    return c.json({ cases, groups: groupList, users: userList } satisfies ResultsFilters);
  });
