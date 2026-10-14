import { useSyncExternalStore } from "react";
/**
 * Профиль игрока и история результатов — пока локально, в браузере.
 * В онлайн-версии (см. working/plans/PLAN.md) это переедет на сервер.
 */

import type { Score } from "../../../../shared/scoring";
import type { FinishInput } from "../../../../shared/judge";
import { readJson, removeKey, writeJson } from "./storage";

const PROFILE_KEY = "profile";
const RESULTS_KEY = "results";
const RESULTS_LIMIT = 50;

export interface Profile {
  name: string;
  group: string;
}

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

/** Последний результат по делу, который можно открыть. */
export const lastResultOf = (caseId: string) => listResults().find((r) => r.caseId === caseId && r.score);

export const EMPTY_PROFILE: Profile = { name: "", group: "" };

export const readProfile = (): Profile => ({ ...EMPTY_PROFILE, ...readJson<Partial<Profile>>(PROFILE_KEY, {}) });
const profileListeners = new Set<() => void>();
export const writeProfile = (p: Profile) => {
  writeJson(PROFILE_KEY, p);
  profileListeners.forEach((l) => l());
};

/** ФИО гостя (без входа) — для шапки и документов; обновляется при сохранении профиля. */
export function useGuestName(): string {
  return useSyncExternalStore(
    (l) => {
      profileListeners.add(l);
      return () => profileListeners.delete(l);
    },
    () => readProfile().name.trim(),
  );
}

/** Результаты, свежие сверху. */
export const listResults = (): ResultRecord[] =>
  readJson<ResultRecord[]>(RESULTS_KEY, [])
    .filter((r) => r && typeof r.caseId === "string")
    .sort((a, b) => b.at - a.at);

export function recordResult(r: ResultRecord) {
  writeJson(RESULTS_KEY, [r, ...listResults()].slice(0, RESULTS_LIMIT));
}

export const clearResults = () => removeKey(RESULTS_KEY);
