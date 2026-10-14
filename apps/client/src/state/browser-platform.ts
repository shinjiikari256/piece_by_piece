import { accountStore } from "./account";
import { clearSave, markPaused, readSave, savePlayerPosition, writeSave } from "./persistence";
import { recordResult } from "./profile";
import type { GamePlatform } from "./platform";
import { uploadResult } from "./results-sync";

/**
 * Платформа в браузере: сохранения и результаты — в `localStorage`; если игрок вошёл в учётную запись,
 * результат ещё и отправляется на сервер (без входа — офлайн-версия и гость, отправлять некуда).
 * Операции асинхронные по контракту, но запись выполняется сразу (важно для `pagehide`).
 */
export function createBrowserPlatform(): GamePlatform {
  return {
    saves: {
      read: async (caseId) => readSave(caseId),
      write: async (save) => writeSave(save),
      clear: async (caseId) => void clearSave(caseId),
      markPaused: async (caseId) => void markPaused(caseId),
      savePlayerPosition: async (caseId, player) => savePlayerPosition(caseId, player),
    },
    results: {
      record: async (result) => {
        recordResult(result);
        const signedIn = !!accountStore.get().me;
        return { delivered: signedIn ? await uploadResult(result) : true };
      },
    },
  };
}
