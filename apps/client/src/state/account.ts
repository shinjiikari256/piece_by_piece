import { useSyncExternalStore } from "react";
import type { LoginBody, Me, PasswordBody, RegisterBody } from "../../../../shared/api";
import { OFFLINE } from "../env";

/**
 * Учётная запись на сервере. Если сервера нет (офлайн-файл, `pnpm dev` без `pnpm server:dev`),
 * игра работает как раньше: профиль и результаты — в браузере, конструктор — за заглушкой входа.
 */

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Запрос к API. Ошибка сервера — ApiFailure с текстом для человека; нет связи — code "network". */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    // абсолютный адрес: страница может быть на любом пути (/admin/users), относительный ./api уехал бы вместе с ним
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure(0, "network", "Нет связи с сервером");
  }
  const json = await res.json().catch(() => null);
  // 200 с не-JSON (например, страница сайта вместо API) — это не ответ сервера
  if (res.ok && json === null && res.status !== 204) throw new ApiFailure(res.status, "network", "Сервер вернул не ответ API");
  if (!res.ok) {
    if (json?.error) throw new ApiFailure(res.status, json.error, json.message ?? "Ошибка");
    throw new ApiFailure(res.status, "network", "Сервер недоступен");
  }
  return json as T;
}

export interface AccountState {
  /** unknown — ещё проверяем; online — сервер есть; none — играем без сервера. */
  server: "unknown" | "online" | "none";
  me: Me | null;
}

let state: AccountState = { server: OFFLINE ? "none" : "unknown", me: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<AccountState>) => {
  state = { ...state, ...patch };
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

/** Узнать, есть ли сервер и кто вошёл. Вызывается при запуске страницы. */
export async function initAccount() {
  if (OFFLINE) return;
  try {
    set({ server: "online", me: await api<Me>("GET", "/me") });
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 401) set({ server: "online", me: null });
    else set({ server: "none", me: null });
  }
}

export const account = {
  async login(body: LoginBody) {
    set({ me: await api<Me>("POST", "/auth/login", body) });
  },
  async register(body: RegisterBody) {
    set({ me: await api<Me>("POST", "/auth/register", body) });
  },
  async logout() {
    await api("POST", "/auth/logout").catch(() => {});
    set({ me: null });
  },
  async changePassword(body: PasswordBody) {
    set({ me: await api<Me>("POST", "/me/password", body) });
  },
  async refresh() {
    await initAccount();
  },
};

// ---------- Ссылка регистрации с группой: ./?join=<token> ----------

const JOIN_PARAM = "join";
let joinToken: string | null = null;
if (typeof location !== "undefined") {
  const params = new URLSearchParams(location.search);
  joinToken = params.get(JOIN_PARAM);
  if (joinToken) {
    params.delete(JOIN_PARAM);
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : ""));
  }
}

/** Токен ссылки, с которой открыли игру (один раз за загрузку). */
export const pendingJoinToken = () => joinToken;
export const clearJoinToken = () => {
  joinToken = null;
};
