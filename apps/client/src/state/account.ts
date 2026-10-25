import { useSyncExternalStore } from "react";
import type { Me } from "../../../../shared/api";
import { OFFLINE } from "../env";
import { setStorageScope } from "./storage";

/**
 * Что известно о учётной записи в этой сборке: есть ли сервер и кто вошёл.
 * Экраны игры и сайта читают только это состояние; запросы к серверу — в `api.ts` (онлайн-сборка).
 * В офлайн-файле сервера нет: `server: none`, `me: null`.
 */

export interface AccountState {
  /** unknown — ещё проверяем; online — сервер есть; none — играем без сервера. */
  server: "unknown" | "online" | "none";
  me: Me | null;
}

let state: AccountState = { server: OFFLINE ? "none" : "unknown", me: null };
const listeners = new Set<() => void>();

/** Меняет состояние; вызывает его только онлайн-код (`api.ts`). */
export const setAccount = (patch: Partial<AccountState>) => {
  state = { ...state, ...patch };
  setStorageScope(state.me ? state.me.id : null);
  listeners.forEach((l) => l());
};

export const accountStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useAccount<T>(selector: (s: AccountState) => T): T {
  return useSyncExternalStore(accountStore.subscribe, () => selector(state));
}

export const isStaff = (me: Me | null) => me?.role === "admin" || me?.role === "teacher";

let markReady!: () => void;
/** Первая проверка сервера закончена (после неё известно, откуда брать дела). */
export const accountReady = new Promise<void>((resolve) => (markReady = resolve));
export const markAccountReady = () => markReady();

// в офлайн-файле проверять нечего
if (OFFLINE) markAccountReady();
