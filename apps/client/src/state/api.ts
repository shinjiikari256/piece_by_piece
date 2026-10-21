import type { LoginBody, Me, PasswordBody, RegisterBody } from "../../../../shared/api";
import { markAccountReady, setAccount } from "./account";

/**
 * Онлайн-часть учётной записи: запросы к API, вход и выход, ссылка регистрации.
 * Модуль грузится только в онлайн-сборке (`state/online-platform.ts`), в офлайн-файл не попадает.
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

/** Узнать, есть ли сервер и кто вошёл. Вызывается при запуске страницы. */
export async function initAccount() {
  try {
    setAccount({ server: "online", me: await api<Me>("GET", "/me") });
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 401) setAccount({ server: "online", me: null });
    else setAccount({ server: "none", me: null });
  } finally {
    markAccountReady();
  }
}

export const account = {
  async login(body: LoginBody) {
    setAccount({ me: await api<Me>("POST", "/auth/login", body) });
  },
  async register(body: RegisterBody) {
    setAccount({ me: await api<Me>("POST", "/auth/register", body) });
  },
  async logout() {
    await api("POST", "/auth/logout").catch(() => {});
    setAccount({ me: null });
  },
  async changePassword(body: PasswordBody) {
    setAccount({ me: await api<Me>("POST", "/me/password", body) });
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
