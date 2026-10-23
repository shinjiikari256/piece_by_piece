import { useSyncExternalStore } from "react";
import { readRaw, removeKey, writeRaw } from "../../state/storage";

/**
 * Тема оформления: роли цвета переопределяются файлом из `styles/themes/` (`:root[data-theme="…"]`).
 * Включается параметром адреса `?theme=salad`, запоминается в браузере и дальше применяется сама;
 * `?theme=default` возвращает обычную тему. Параметр после применения убирается из адреса.
 */
export const THEMES = ["salad"] as const;
export type ThemeName = (typeof THEMES)[number];

/** Названия тем в меню; `null` — обычная. */
export const THEME_LABELS: Record<ThemeName, string> = { salad: "Салатная" };
export const DEFAULT_THEME_LABEL = "Обычная";

const KEY = "theme";
const isTheme = (v: string | null): v is ThemeName => !!v && (THEMES as readonly string[]).includes(v);

/** Какую тему включить: параметр адреса главнее сохранённой; `default` — обычная; неизвестное имя игнорируется. */
export function pickTheme(param: string | null, saved: string | null): { theme: ThemeName | null; save: boolean; clear: boolean } {
  if (param === "default") return { theme: null, save: false, clear: true };
  if (isTheme(param)) return { theme: param, save: true, clear: false };
  return { theme: isTheme(saved) ? saved : null, save: false, clear: false };
}

const listeners = new Set<() => void>();

export function applyTheme(theme: ThemeName | null) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  listeners.forEach((l) => l());
}

/** Выбрать тему из интерфейса: применить и запомнить (`null` — обычная). */
export function setTheme(theme: ThemeName | null) {
  if (theme) writeRaw(KEY, theme);
  else removeKey(KEY);
  applyTheme(theme);
}

const current = (): ThemeName | null => {
  const t = typeof document === "undefined" ? null : (document.documentElement.dataset.theme ?? null);
  return isTheme(t) ? t : null;
};

/** Текущая тема (перерисовывается при смене). */
export function useTheme(): ThemeName | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
    () => null,
  );
}

/** При старте: выбрать тему, запомнить и убрать параметр из адреса. */
export function initTheme() {
  const params = new URLSearchParams(location.search);
  const param = params.get("theme");
  const { theme, save, clear } = pickTheme(param, readRaw(KEY));
  if (save) writeRaw(KEY, theme!);
  if (clear) removeKey(KEY);
  applyTheme(theme);
  if (param !== null) {
    params.delete("theme");
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
  }
}
