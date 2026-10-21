import { clearSave, listSaves, markPaused, readSave, savePlayerPosition, writeSave } from "./persistence";
import { clearResults, listResults, readProfile, recordResult, subscribeProfile, writeProfile } from "./profile";
import { OFFLINE } from "../env";
import type { GamePlatform } from "./platform";

/**
 * Платформа в браузере: сохранения и результаты — в `localStorage`. Результаты вошедшего игрока на сервер
 * пишет судья (`ApiAuthority.finish`), платформа их не отправляет.
 * Операции асинхронные по контракту, но запись выполняется сразу (важно для `pagehide`).
 */
export function createBrowserPlatform(): GamePlatform {
  return {
    saves: {
      list: async () => listSaves(),
      read: async (caseId) => readSave(caseId),
      write: async (save) => writeSave(save),
      clear: async (caseId) => void clearSave(caseId),
      markPaused: async (caseId) => void markPaused(caseId),
      savePlayerPosition: async (caseId, player) => savePlayerPosition(caseId, player),
    },
    results: {
      record: async (result) => {
        recordResult(result);
        // на сервер результат попадает только от судьи (`recordedOnServer`); у гостя и в локальных запусках он остаётся здесь
        return { delivered: true };
      },
      list: async () => listResults(),
      clear: async () => clearResults(),
    },
    profile: {
      read: async () => readProfile(),
      write: async (profile) => writeProfile(profile),
      subscribe: subscribeProfile,
    },
    capabilities: { offline: OFFLINE },
  };
}
