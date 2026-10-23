import { eq, sql, type SQL } from "drizzle-orm";
import type { ResultsStats } from "../../../shared/api";
import type { Db } from "./db";
import { results, users } from "./db/schema";

/**
 * Аналитика по выборке прохождений агрегатами в базе — тот же результат, что у `resultsStats`
 * (`shared/results-stats.ts`, им считает режим без сервера), но без выгрузки строк в память.
 * Изменили здесь правила — менять и там: тест `server.test.ts` сверяет оба.
 */

const num = (e: SQL) => e.mapWith(Number);
const round1 = (e: SQL) => sql`round((${e})::numeric, 1)`;

export async function queryResultsStats(db: Db, where: SQL | undefined): Promise<ResultsStats> {
  // база для процентов — максимум без бонуса за время
  const bonusMax = sql`coalesce((${results.score} -> 'timeBonus' ->> 'max')::numeric, 0)`;
  const base = sql`(${results.max} - ${bonusMax})`;
  const pct = sql`(${results.total}::numeric / nullif(${base}, 0) * 100)`;
  const hasBonus = sql`jsonb_typeof(${results.score} -> 'timeBonus') = 'object'`;
  const bucket = (lo: number | null, hi: number | null) =>
    num(sql`count(*) filter (where ${pct} is not null${lo === null ? sql`` : sql` and ${pct} >= ${lo}`}${hi === null ? sql`` : sql` and ${pct} < ${hi}`})`);

  const [row] = await db
    .select({
      attempts: num(sql`count(*)`),
      users: num(sql`count(distinct ${results.userId})`),
      cases: num(sql`count(distinct ${results.caseId})`),
      avgPercent: num(round1(sql`avg(${pct})`)),
      medianPercent: num(round1(sql`percentile_cont(0.5) within group (order by ${pct})`)),
      avgMinutes: num(round1(sql`avg(${results.elapsedMs}) / 60000.0`)),
      avgHints: num(round1(sql`avg(${results.hintsUsed})`)),
      avgWrong: num(round1(sql`avg(${results.wrongDeductions})`)),
      withBonus: num(sql`count(*) filter (where ${hasBonus})`),
      gotBonus: num(sql`count(*) filter (where ${hasBonus} and coalesce((${results.score} -> 'timeBonus' ->> 'points')::numeric, 0) > 0)`),
      b0: bucket(null, 40),
      b1: bucket(40, 65),
      b2: bucket(65, 85),
      b3: bucket(85, 100),
      b4: bucket(100, null),
      h0: num(sql`count(*) filter (where ${results.hintsUsed} = 0)`),
      h1: num(sql`count(*) filter (where ${results.hintsUsed} = 1)`),
      h2: num(sql`count(*) filter (where ${results.hintsUsed} = 2)`),
      h3: num(sql`count(*) filter (where ${results.hintsUsed} >= 3)`),
    })
    .from(results)
    .innerJoin(users, eq(users.id, results.userId))
    .where(where);

  // разделы решения: порядок — как в деле (по номеру внутри списка групп)
  const sections = await db
    .select({
      label: sql<string>`g.value ->> 'label'`,
      percent: num(sql`round(avg(((g.value ->> 'points')::numeric / (g.value ->> 'max')::numeric) * 100))`),
    })
    .from(results)
    .innerJoin(users, eq(users.id, results.userId))
    .innerJoin(
      sql`lateral jsonb_array_elements(case when jsonb_typeof(${results.score} -> 'groups') = 'array' then ${results.score} -> 'groups' else '[]'::jsonb end) with ordinality as g(value, ord)`,
      sql`true`,
    )
    .where(sql`${where ?? sql`true`} and coalesce((g.value ->> 'max')::numeric, 0) <> 0`)
    .groupBy(sql`g.value ->> 'label'`)
    .orderBy(sql`min(g.ord)`);

  return {
    attempts: row.attempts,
    users: row.users,
    cases: row.cases,
    avgPercent: row.avgPercent,
    medianPercent: row.medianPercent,
    avgMinutes: row.avgMinutes,
    avgHints: row.avgHints,
    avgWrongDeductions: row.avgWrong,
    bonusShare: row.withBonus ? Math.round((row.gotBonus / row.withBonus) * 100) : null,
    buckets: [
      { label: "0–39%", count: row.b0 },
      { label: "40–64%", count: row.b1 },
      { label: "65–84%", count: row.b2 },
      { label: "85–99%", count: row.b3 },
      { label: "100%+", count: row.b4 },
    ],
    sections,
    hints: [
      { label: "без подсказок", count: row.h0 },
      { label: "1", count: row.h1 },
      { label: "2", count: row.h2 },
      { label: "3 и больше", count: row.h3 },
    ],
  };
}
