import type { ResultBody } from "../../../../shared/api";
import { api } from "./account";
import type { ResultRecord } from "./profile";

/**
 * Вошедший игрок — результат уходит в учётную запись (виден преподавателю).
 * Не получилось — остаётся в браузере, `onFail` показывает это игроку.
 */
export async function uploadResult(r: ResultRecord, onFail: () => void) {
  const body: ResultBody = {
    caseId: r.caseId,
    caseNumber: r.number,
    caseTitle: r.title,
    total: r.total,
    max: r.max,
    hintsUsed: r.hintsUsed,
    wrongDeductions: r.wrongDeductions ?? 0,
    elapsedMs: r.input?.elapsedMs == null ? null : Math.round(r.input.elapsedMs),
    score: r.score as unknown as Record<string, unknown>,
    input: (r.input ?? null) as Record<string, unknown> | null,
    caseConfigVersion: r.caseConfigVersion ?? null,
    gameVersion: r.gameVersion ?? null,
    resultFormatVersion: r.resultFormatVersion ?? 1,
    finishedAt: new Date(r.at).toISOString(),
  };
  try {
    await api("POST", "/me/results", body);
  } catch {
    onFail();
  }
}
