import type { ResultRecord } from "./result-record";
import type { Profile } from "./platform";
import { OFFLINE } from "../env";

/**
 * Файл результата: офлайн-игрок отдаёт его преподавателю, тот импортирует в портал.
 * Портал пересчитывает баллы сам по `input` и версии дела — итог в файле только для глаз.
 */
export interface ResultFile {
  type: "pokusochkam-result";
  resultFormatVersion: number;
  gameVersion: string | null;
  offline: boolean;
  /** Кто проходил (без входа): ФИО и группа — по ним преподаватель найдёт студента при импорте. */
  player: { name: string; group: string };
  case: { id: string; number: string; title: string; configVersion: string | null };
  finishedAt: string;
  total: number;
  max: number;
  input: ResultRecord["input"] | null;
}

export function toResultFile(r: ResultRecord, p: Profile): ResultFile {
  return {
    type: "pokusochkam-result",
    resultFormatVersion: r.resultFormatVersion ?? 1,
    gameVersion: r.gameVersion ?? null,
    offline: OFFLINE,
    player: { name: p.name.trim(), group: p.group.trim() },
    case: { id: r.caseId, number: r.number, title: r.title, configVersion: r.caseConfigVersion ?? null },
    finishedAt: new Date(r.at).toISOString(),
    total: r.total,
    max: r.max,
    input: r.input ?? null,
  };
}

export function downloadResult(r: ResultRecord, p: Profile) {
  const blob = new Blob([JSON.stringify(toResultFile(r, p), null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const who = p.name.trim().split(/\s+/)[0] || "igrok";
  a.download = `rezultat-${r.number}-${who}-${new Date(r.at).toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
