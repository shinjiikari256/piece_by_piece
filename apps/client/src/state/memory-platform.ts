import { SAVE_FORMAT_VERSION } from "../../../../shared/migrate";
import type { GamePlatform } from "./platform";
import type { ResultRecord } from "./result-record";
import type { SaveData } from "./save-data";

export type MemoryPlatform = GamePlatform & {
  /** Что платформа хранит: для проверок в тестах. */
  data: { saves: Map<string, SaveData>; results: ResultRecord[] };
};

/** Платформа в памяти: без `localStorage` и сервера. `deliver: false` — результаты «не доходят» (проверка предупреждения). */
export function createMemoryPlatform({ deliver = true }: { deliver?: boolean } = {}): MemoryPlatform {
  const saves = new Map<string, SaveData>();
  const results: ResultRecord[] = [];
  const patch = (caseId: string, change: Partial<SaveData>) => {
    const save = saves.get(caseId);
    if (save) saves.set(caseId, { ...save, ...change });
  };
  return {
    data: { saves, results },
    saves: {
      read: async (caseId) => saves.get(caseId) ?? null,
      write: async (save) => {
        saves.set(save.caseId, { ...save, v: SAVE_FORMAT_VERSION, savedAt: Date.now(), player: saves.get(save.caseId)?.player });
        return true;
      },
      clear: async (caseId) => void saves.delete(caseId),
      markPaused: async (caseId) => {
        if (saves.get(caseId) && !saves.get(caseId)!.pausedAt) patch(caseId, { pausedAt: Date.now() });
      },
      savePlayerPosition: async (caseId, player) => patch(caseId, { player }),
    },
    results: {
      record: async (result) => {
        results.unshift(result);
        return { delivered: deliver };
      },
    },
  };
}
