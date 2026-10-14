import { listKeys, readJson, removeKey, writeJson } from "../state/storage";

/**
 * Черновики дел из конструктора. Живут в localStorage этого браузера;
 * игра показывает их в списке дел с пометкой «черновик» — так конструктор
 * может запустить проверку дела в игре без сборки.
 */

const PREFIX = "draft:";
const PLAYTEST_KEY = "playtest";

export const saveDraft = (id: string, raw: unknown) => writeJson(PREFIX + id, raw);

export const readDraft = (id: string): unknown | null => readJson<unknown | null>(PREFIX + id, null);

export const deleteDraft = (id: string) => removeKey(PREFIX + id);

export const listDraftIds = (): string[] => listKeys(PREFIX).map((k) => k.slice(PREFIX.length)).sort();

/** Копия дела для «Запустить» — не зависит от «Сохранить». */
export const savePlaytest = (raw: unknown) => writeJson(PLAYTEST_KEY, raw);

export const readPlaytest = (): unknown | null => readJson<unknown | null>(PLAYTEST_KEY, null);
