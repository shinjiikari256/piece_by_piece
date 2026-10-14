import { storageKey } from "../env";

/**
 * Единая обёртка над localStorage. Хранилище может быть недоступно (приватное окно, заблокированные данные,
 * тесты) или переполнено — тогда чтение возвращает запасное значение, запись возвращает false и сообщает
 * подписчикам (`onWriteFailed`), а игра и конструктор продолжают работать без сохранения.
 * Ключи — `storageKey(name)`: в офлайн-файле у них свой префикс.
 */

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
    return safeStorage()?.getItem(storageKey(name)) ?? null;
  } catch {
    return null;
  }
}

/** true — записано; false — хранилища нет или оно переполнено (подписчики уведомлены). */
export function writeRaw(name: string, value: string): boolean {
  try {
    const s = safeStorage();
    if (!s) return false;
    s.setItem(storageKey(name), value);
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
    safeStorage()?.removeItem(storageKey(name));
  } catch {
    /* ничего */
  }
}

/** Имена (без префикса `storageKey`) всех ключей, начинающихся с `prefix`. */
export function listKeys(prefix: string): string[] {
  const s = safeStorage();
  if (!s) return [];
  const full = storageKey(prefix);
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
