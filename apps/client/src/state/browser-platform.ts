import { accountStore } from "./account";
import { clearSave, listSaves, markPaused, readSave, savePlayerPosition, writeSave } from "./persistence";
import { clearResults, listResults, readProfile, recordResult, subscribeProfile, writeProfile } from "./profile";
import { OFFLINE } from "../env";
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
      list: async () => listSaves(),
      read: async (caseId) => readSave(caseId),
      write: async (save) => writeSave(save),
      clear: async (caseId) => void clearSave(caseId),
      markPaused: async (caseId) => void markPaused(caseId),
      savePlayerPosition: async (caseId, player) => savePlayerPosition(caseId, player),
    },
    results: {
      record: async (result, opts) => {
        recordResult(result);
        const signedIn = !!accountStore.get().me;
        // судья на сервере уже записал результат сам
        if (opts?.recordedOnServer) return { delivered: true };
        return { delivered: signedIn ? await uploadResult(result) : true };
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
