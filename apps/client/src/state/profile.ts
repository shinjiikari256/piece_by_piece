/**
 * Профиль игрока и история результатов — пока локально, в браузере.
 * В онлайн-версии (см. working/plans/BACKEND.md) это переедет на сервер.
 */

import type { ResultRecord } from "./result-record";
export type { ResultRecord } from "./result-record";
import { readJson, removeKey, writeJson } from "./storage";
import { EMPTY_PROFILE, type Profile } from "./platform";

const PROFILE_KEY = "profile";
const RESULTS_KEY = "results";
const RESULTS_LIMIT = 50;

export const readProfile = (): Profile => ({ ...EMPTY_PROFILE, ...readJson<Partial<Profile>>(PROFILE_KEY, {}) });
const profileListeners = new Set<() => void>();
export const writeProfile = (p: Profile) => {
  writeJson(PROFILE_KEY, p);
  profileListeners.forEach((l) => l());
};

export function subscribeProfile(listener: () => void) {
  profileListeners.add(listener);
  return () => void profileListeners.delete(listener);
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
