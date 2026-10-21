import { describe, expect, it } from "vitest";
import { resultsStats, type StatsRow } from "../../../shared/results-stats";
import { memoryDb, schema } from "./db";
import { queryResultsStats } from "./results-stats-sql";

/** SQL-агрегаты обязаны давать то же, что `resultsStats` на тех же строках. */
const score = (groups: { label: string; points: number; max: number }[] | undefined, timeBonus?: { max: number; points: number } | null) => ({
  total: 0,
  max: 0,
  ...(timeBonus === undefined ? {} : { timeBonus }),
  ...(groups ? { groups } : {}),
});

const ROWS: (Omit<StatsRow, "userId"> & { user: number })[] = [
  { user: 0, caseId: "c1", total: 55, max: 110, hintsUsed: 0, wrongDeductions: 1, elapsedMs: 600_000, score: score([{ label: "Право", points: 10, max: 30 }, { label: "Квалификация", points: 20, max: 20 }], { max: 10, points: 0 }) },
  { user: 0, caseId: "c1", total: 110, max: 110, hintsUsed: 1, wrongDeductions: 0, elapsedMs: 900_000, score: score([{ label: "Право", points: 30, max: 30 }, { label: "Квалификация", points: 20, max: 20 }], { max: 10, points: 10 }) },
  { user: 1, caseId: "c2", total: 80, max: 100, hintsUsed: 3, wrongDeductions: 2, elapsedMs: null, score: score(undefined, null) },
  { user: 2, caseId: "c2", total: 30, max: 100, hintsUsed: 2, wrongDeductions: 5, elapsedMs: 1_200_000, score: score([{ label: "Право", points: 5, max: 0 }]) },
  { user: 2, caseId: "c1", total: 99, max: 100, hintsUsed: 7, wrongDeductions: 0, elapsedMs: 100_000, score: score([{ label: "Право", points: 1, max: 3 }]) },
];

describe("статистика результатов в SQL", () => {
  it("совпадает с расчётом в памяти", async () => {
    const db = await memoryDb();
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const [u] = await db.insert(schema.users).values({ login: `u${i}`, fullName: `Студент ${i}`, passwordHash: "x", role: "student", status: "active" }).returning({ id: schema.users.id });
      ids.push(u.id);
    }
    for (const r of ROWS)
      await db.insert(schema.results).values({
        userId: ids[r.user], caseId: r.caseId, caseNumber: "1", caseTitle: "Дело", total: r.total, max: r.max, hintsUsed: r.hintsUsed,
        wrongDeductions: r.wrongDeductions, elapsedMs: r.elapsedMs, score: r.score, finishedAt: new Date(), source: "client", resultFormatVersion: 1,
      });
    const expected = resultsStats(ROWS.map((r) => ({ ...r, userId: ids[r.user] })));
    expect(await queryResultsStats(db, undefined)).toEqual(expected);
  });

  it("пустая выборка", async () => {
    const stats = await queryResultsStats(await memoryDb(), undefined);
    expect(stats).toEqual(resultsStats([]));
  });
});
