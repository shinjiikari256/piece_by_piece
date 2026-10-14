/**
 * Где запущена игра.
 * Офлайн-сборка — один .html с вшитыми делами (`pnpm export:offline`): без конструктора и черновиков.
 * У всех файлов, открытых с диска, общее хранилище браузера, поэтому ключи офлайн-сборки
 * получают её идентификатор — разные сборки не видят сохранений друг друга.
 */

export { APP_NAME, APP_NAME_LATIN } from "../../../shared/brand";

export const OFFLINE = import.meta.env.MODE === "offline";

/** Без сервера конструктор открыт только при разработке (`pnpm dev`); в сборке он работает через сервер. */
export const DEV_EDITOR = !OFFLINE && import.meta.env.MODE === "development";

/** Игру запустили из конструктора (`?play=<id>&from=editor`, после перезагрузки — `/playtest`): тестовая копия дела; читается один раз при загрузке, до очистки адреса. */
export const FROM_EDITOR =
  typeof location !== "undefined" && !OFFLINE && (new URLSearchParams(location.search).get("from") === "editor" || location.pathname === "/playtest");

/** Версия клиента (package.json) — пишется в результат. */
export const GAME_VERSION: string = __GAME_VERSION__;

export interface EmbeddedCases {
  /** Идентификатор набора дел: хеш их id и версий. */
  buildId: string;
  cases: unknown[];
}

let embedded: EmbeddedCases | null | undefined;

/** Дела, вшитые в офлайн-сборку (`<script type="application/json" id="cases">`). */
export function embeddedCases(): EmbeddedCases | null {
  if (embedded !== undefined) return embedded;
  try {
    const el = typeof document === "undefined" ? null : document.getElementById("cases");
    embedded = el?.textContent ? (JSON.parse(el.textContent) as EmbeddedCases) : null;
  } catch {
    embedded = null;
  }
  return embedded;
}

/** Ключ localStorage: `pokusochkam:<name>`, в офлайн-сборке — `pokusochkam:offline:<buildId>:<name>`. */
export function storageKey(name: string): string {
  const build = OFFLINE ? embeddedCases()?.buildId : undefined;
  return build ? `pokusochkam:offline:${build}:${name}` : `pokusochkam:${name}`;
}
