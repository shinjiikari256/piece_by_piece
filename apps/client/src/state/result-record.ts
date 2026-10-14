import type { Score } from "../../../../shared/scoring";
import type { FinishInput } from "../../../../shared/judge";

/** Запись о прохождении: что хранит платформа в истории результатов игрока. */
export interface ResultRecord {
  caseId: string;
  number: string;
  title: string;
  total: number;
  max: number;
  hintsUsed: number;
  at: number;
  /** Полный подсчёт — чтобы открыть результат из списка дел (у старых записей нет). */
  score?: Score;
  wrongDeductions?: number;
  /** Чьё прохождение, если оно не своё (преподаватель открыл результат студента) — для документов. */
  owner?: { id?: number; fullName: string; group?: string };
  /** Что сдал игрок — по этому портал пересчитает результат при импорте файла. */
  input?: FinishInput;
  caseConfigVersion?: string | null;
  gameVersion?: string;
  resultFormatVersion?: number;
}

/** Последний результат по делу, который можно открыть (из списка, свежие сверху). */
export const lastResultOf = (results: ResultRecord[], caseId: string) => results.find((r) => r.caseId === caseId && r.score);
