import type { SaveData } from "./save-data";
import { accountStore } from "./account";
import { api, initAccount } from "./api";
import { setPlatform, type GamePlatform, type SaveStore } from "./platform";

/** Пауза между правкой и отправкой на сервер: автосохранение пишет на каждый шаг, серверу хватает последнего. */
const PUSH_DELAY_MS = 3000;

/** Вошёл ли игрок на сервер, где можно хранить сохранения. */
export const isSignedIn = () => {
  const s = accountStore.get();
  return s.server === "online" && !!s.me;
};

const savePath = (caseId: string) => `/me/saves/${encodeURIComponent(caseId)}`;

/**
 * Платформа вошедшего игрока: поверх локальной (она остаётся запасом на случай обрыва связи) сохранения
 * ещё и лежат на сервере, поэтому дело можно продолжить с другого устройства. Пока игрок не вошёл —
 * ведёт себя как локальная. Запись всегда сначала локальная и мгновенная (важно для `pagehide`), на сервер
 * уходит с задержкой; свежее из двух копий выбирается по `savedAt`. Не дошло — не страшно, уйдёт при следующей правке.
 */
export function createOnlinePlatform(local: GamePlatform, signedIn: () => boolean = isSignedIn): GamePlatform {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancel = (caseId: string) => {
    clearTimeout(timers.get(caseId));
    timers.delete(caseId);
  };

  /** Отправить на сервер то, что сейчас лежит локально. `keepalive` — запрос переживает закрытие вкладки. */
  async function push(caseId: string, keepalive = false) {
    cancel(caseId);
    if (!signedIn()) return;
    const save = await local.saves.read(caseId);
    if (!save) return;
    try {
      if (keepalive) {
        await fetch(`/api${savePath(caseId)}`, {
          method: "PUT",
          credentials: "same-origin",
          keepalive: true,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(save),
        });
      } else await api("PUT", savePath(caseId), save);
    } catch {
      /* связи нет — локальная копия на месте */
    }
  }

  const schedule = (caseId: string) => {
    cancel(caseId);
    timers.set(
      caseId,
      setTimeout(() => void push(caseId), PUSH_DELAY_MS),
    );
  };

  /** Серверная копия новее локальной — переносим её в локальное хранилище, чтобы дальше работать с ней. */
  async function adopt(remote: SaveData): Promise<SaveData> {
    const { player, pausedAt, ...rest } = remote;
    await local.saves.write(rest);
    if (pausedAt) await local.saves.markPaused(remote.caseId);
    if (player) await local.saves.savePlayerPosition(remote.caseId, player);
    return (await local.saves.read(remote.caseId)) ?? remote;
  }

  const fetchRemote = async (caseId: string) => {
    try {
      return await api<SaveData>("GET", savePath(caseId));
    } catch {
      return null;
    }
  };

  const saves: SaveStore = {
    ...local.saves,
    async write(save) {
      const ok = await local.saves.write(save);
      if (ok && signedIn()) schedule(save.caseId);
      return ok;
    },
    async read(caseId) {
      const mine = await local.saves.read(caseId);
      if (!signedIn()) return mine;
      const remote = await fetchRemote(caseId);
      return remote && (!mine || remote.savedAt > mine.savedAt) ? adopt(remote) : mine;
    },
    async list() {
      const mine = await local.saves.list();
      if (!signedIn()) return mine;
      let remote: SaveData[];
      try {
        remote = await api<SaveData[]>("GET", "/me/saves");
      } catch {
        return mine;
      }
      const byCase = new Map(mine.map((s) => [s.caseId, s]));
      for (const r of remote) {
        const m = byCase.get(r.caseId);
        if (!m || r.savedAt > m.savedAt) byCase.set(r.caseId, r);
      }
      return [...byCase.values()].sort((a, b) => b.savedAt - a.savedAt);
    },
    async clear(caseId) {
      cancel(caseId);
      await local.saves.clear(caseId);
      if (!signedIn()) return;
      try {
        await api("DELETE", savePath(caseId));
      } catch {
        /* на сервере сохранение останется и вернётся при чтении — игрок сможет стереть его снова */
      }
    },
    async markPaused(caseId) {
      await local.saves.markPaused(caseId);
      await push(caseId, true);
    },
  };

  return { ...local, saves };
}

/** Онлайн-сборка: платформа с сервером поверх браузерной и проверка учётной записи (не ждём её — страница открывается сразу). */
export function connectOnline(browser: GamePlatform) {
  setPlatform(createOnlinePlatform(browser));
  void initAccount();
}
