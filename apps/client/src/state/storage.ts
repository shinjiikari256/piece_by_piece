import { storageKey } from "../env";

/**
 * Единая обёртка над localStorage. Хранилище может быть недоступно (приватное окно, заблокированные данные,
 * тесты) или переполнено — тогда чтение возвращает запасное значение, запись возвращает false и сообщает
 * подписчикам (`onWriteFailed`), а игра и конструктор продолжают работать без сохранения.
 * Ключи — `storageKey(name)`: в офлайн-файле у них свой префикс.
 */

/**
 * Данные игрока (сохранения, результаты, профиль) лежат отдельно для каждой учётной записи: у вошедшего ключи
 * получают префикс `u<id>.`, у гостя — прежние. Так на общем компьютере чужие сохранения не видны.
 * Остальное (черновики конструктора, тема, масштаб) относится к устройству и не меняется.
 */
const PER_USER = /^(save:|results$|profile$)/;
let userScope: number | null = null;

/** Чьи данные сейчас читаем: id вошедшего или null (гость). Вызывает только `account.ts`. */
export function setStorageScope(userId: number | null) {
  userScope = userId;
}

const scoped = (name: string, scope = userScope) => (scope !== null && PER_USER.test(name) ? `u${scope}.${name}` : name);

export function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const failListeners = new Set<(key: string) => void>();

/** Подписка на неудачную запись (переполнение, запрет). Возвращает отписку. */
export function onWriteFailed(listener: (key: string) => void): () => void {
  failListeners.add(listener);
  return () => failListeners.delete(listener);
}

export function readRaw(name: string): string | null {
  try {
    return safeStorage()?.getItem(storageKey(scoped(name))) ?? null;
  } catch {
    return null;
  }
}

/** true — записано; false — хранилища нет или оно переполнено (подписчики уведомлены). */
export function writeRaw(name: string, value: string): boolean {
  try {
    const s = safeStorage();
    if (!s) return false;
    s.setItem(storageKey(scoped(name)), value);
    return true;
  } catch {
    failListeners.forEach((l) => l(name));
    return false;
  }
}

export function readJson<T>(name: string, fallback: T): T {
  try {
    const raw = readRaw(name);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const writeJson = (name: string, value: unknown): boolean => writeRaw(name, JSON.stringify(value));

export function removeKey(name: string) {
  try {
    safeStorage()?.removeItem(storageKey(scoped(name)));
  } catch {
    /* ничего */
  }
}

/** Имена (без префикса `storageKey`) всех ключей, начинающихся с `prefix`. */
export function listKeys(prefix: string): string[] {
  const s = safeStorage();
  if (!s) return [];
  const full = storageKey(scoped(prefix));
  const names: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key?.startsWith(full)) names.push(prefix + key.slice(full.length));
    }
  } catch {
    /* см. выше */
  }
  return names;
}

const guestNames = (): string[] => {
  const s = safeStorage();
  if (!s) return [];
  const base = storageKey("");
  const names: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key?.startsWith(base) && PER_USER.test(key.slice(base.length))) names.push(key.slice(base.length));
    }
  } catch {
    /* см. выше */
  }
  return names;
};

/** Есть ли у гостя на этом устройстве сохранения или результаты, которые можно передать вошедшему. */
export const hasGuestData = (): boolean => guestNames().some((n) => n !== "profile");

/** Перенести данные гостя вошедшему (его собственные записи не затираются) и убрать их из гостевой области. */
export function moveGuestDataToUser(userId: number) {
  const s = safeStorage();
  if (!s) return;
  for (const name of guestNames()) {
    const from = storageKey(name);
    const to = storageKey(scoped(name, userId));
    try {
      if (s.getItem(to) === null) s.setItem(to, s.getItem(from) ?? "");
      s.removeItem(from);
    } catch {
      /* переполнение — оставляем у гостя */
    }
  }
}

