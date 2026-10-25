import type { ResultsStats } from "./api";

/** Аналитика по выборке прохождений — общая для сервера и режима без сервера. */

export interface StatsRow {
  userId: number | string;
  caseId: string;
  total: number;
  max: number;
  hintsUsed: number;
  wrongDeductions: number;
  elapsedMs: number | null;
  score: unknown;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
};

interface ScoreJson {
  timeBonus?: { max?: number; points?: number } | null;
  groups?: { label: string; points: number; max: number }[];
}

/** Аналитика по выборке прохождений. */
export function resultsStats(rows: StatsRow[]): ResultsStats {
  const percents = rows.filter((r) => r.max > 0).map((r) => Math.min(100, (r.total / r.max) * 100));
  const withBonus = rows.filter((r) => (r.score as ScoreJson)?.timeBonus);
  const bucket = (lo: number, hi: number) => percents.filter((p) => p >= lo && p < hi).length;
  const sections = new Map<string, { sum: number; n: number }>();
  for (const r of rows)
    for (const g of (r.score as ScoreJson)?.groups ?? []) {
      if (!g.max) continue;
      const acc = sections.get(g.label) ?? { sum: 0, n: 0 };
      acc.sum += (g.points / g.max) * 100;
      acc.n += 1;
      sections.set(g.label, acc);
    }
  return {
    attempts: rows.length,
    users: new Set(rows.map((r) => r.userId)).size,
    cases: new Set(rows.map((r) => r.caseId)).size,
    avgPercent: avg(percents),
    medianPercent: median(percents),
    avgMinutes: avg(rows.flatMap((r) => (r.elapsedMs == null ? [] : [r.elapsedMs / 60_000]))),
    avgHints: avg(rows.map((r) => r.hintsUsed)),
    avgWrongDeductions: avg(rows.map((r) => r.wrongDeductions)),
    bonusShare: withBonus.length ? Math.round((withBonus.filter((r) => ((r.score as ScoreJson).timeBonus?.points ?? 0) > 0).length / withBonus.length) * 100) : null,
    buckets: [
      { label: "0–39%", count: bucket(-Infinity, 40) },
      { label: "40–64%", count: bucket(40, 65) },
      { label: "65–84%", count: bucket(65, 85) },
      { label: "85–99%", count: bucket(85, 100) },
      { label: "100%+", count: bucket(100, Infinity) },
    ],
    sections: [...sections].map(([label, { sum, n }]) => ({ label, percent: Math.round(sum / n) })),
    hints: [
      { label: "без подсказок", count: rows.filter((r) => r.hintsUsed === 0).length },
      { label: "1", count: rows.filter((r) => r.hintsUsed === 1).length },
      { label: "2", count: rows.filter((r) => r.hintsUsed === 2).length },
      { label: "3 и больше", count: rows.filter((r) => r.hintsUsed >= 3).length },
    ],
  };
}
