/**
 * Где запущена игра.
 * Офлайн-сборка — один .html с вшитыми делами (`pnpm export:offline`): без конструктора и черновиков; вариант `offline-editor` — с конструктором.
 * У всех файлов, открытых с диска, общее хранилище браузера, поэтому ключи офлайн-сборки
 * получают её идентификатор — разные сборки не видят сохранений друг друга.
 */

import { readEmbedded } from "./embedded";

export { APP_NAME, APP_NAME_LATIN } from "../../../shared/brand";

export const OFFLINE_EDITOR = import.meta.env.MODE === "offline-editor";

export const OFFLINE = import.meta.env.MODE === "offline" || OFFLINE_EDITOR;

/** Без сервера конструктор открыт только при разработке (`pnpm dev`) и в офлайн-файле с конструктором; в сборке он работает через сервер. */
export const DEV_EDITOR = (!OFFLINE && import.meta.env.MODE === "development") || OFFLINE_EDITOR;

/** Игру запустили из конструктора (`?play=<id>&from=editor`, после перезагрузки — `/playtest`): тестовая копия дела; читается один раз при загрузке, до очистки адреса. */
export const FROM_EDITOR =
  typeof location !== "undefined" &&
  (!OFFLINE || OFFLINE_EDITOR) &&
  (new URLSearchParams(location.search).get("from") === "editor" || (OFFLINE ? location.hash.startsWith("#/playtest") : location.pathname === "/playtest"));

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
  embedded = readEmbedded<EmbeddedCases>("cases");
  return embedded;
}

/** Ключ localStorage: `pokusochkam:<name>`, в офлайн-сборке — `pokusochkam:offline:<buildId>:<name>`. */
export function storageKey(name: string): string {
  const build = OFFLINE ? embeddedCases()?.buildId : undefined;
  return build ? `pokusochkam:offline:${build}:${name}` : `pokusochkam:${name}`;
}
