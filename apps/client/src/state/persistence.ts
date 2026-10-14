import { SAVE_FORMAT_VERSION, migrateSave } from "../../../../shared/migrate";
import { listKeys, readJson, removeKey, writeJson } from "./storage";
import type { SaveData } from "./save-data";
export { formatDate, isSaveOutdated, sanitizeSave, type SaveData } from "./save-data";

/**
 * Сохранение расследования в localStorage — отдельно для каждого дела.
 * Хранилище может быть недоступно (приватный режим, запрет сайта) —
 * тогда игра просто работает без сохранений.
 */

const PREFIX = "save:";
const VERSION = SAVE_FORMAT_VERSION;

export function readSave(caseId: string): SaveData | null {
  const raw = readJson<unknown>(PREFIX + caseId, null);
  const m = raw ? migrateSave(raw) : null;
  const data = m?.ok ? (m.data as unknown as SaveData) : null;
  return data && data.caseId === caseId ? data : null;
}

export function writeSave(data: Omit<SaveData, "v" | "savedAt" | "player">): boolean {
  const player = readSave(data.caseId)?.player;
  return writeJson(PREFIX + data.caseId, { ...data, v: VERSION, savedAt: Date.now(), player });
}

/** Позицию игрока пишет сцена; только поверх уже существующего сохранения. */
export function savePlayerPosition(caseId: string, player: { x: number; y: number; locationId: string }) {
  const save = readSave(caseId);
  if (save) writeJson(PREFIX + caseId, { ...save, player });
}

/** Отметить паузу (выход в меню, закрытие страницы) поверх существующего сохранения. */
export function markPaused(caseId: string, at = Date.now()) {
  const save = readSave(caseId);
  if (save && !save.pausedAt) writeJson(PREFIX + caseId, { ...save, pausedAt: at });
}

export const clearSave = (caseId: string) => removeKey(PREFIX + caseId);

export function listSaves(): SaveData[] {
  const saves = listKeys(PREFIX).map((k) => readSave(k.slice(PREFIX.length)));
  return saves.filter((s): s is SaveData => !!s).sort((a, b) => b.savedAt - a.savedAt);
}

