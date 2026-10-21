import { createElement, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { OFFLINE } from "../env";

/**
 * Страницы сайта — по обычным адресам (`/cases`, `/account`, `/admin/users/12`).
 * Исключение — офлайн-файл с диска: у него нет сервера, поэтому адрес живёт после `#` (`#/cases`); маршруты те же.
 * Расследование (вступление, поле, итог) живёт в сторе игры, поверх страниц.
 */

export type Route =
  | { page: "home" }
  | { page: "cases" }
  | { page: "howto" }
  | { page: "results" }
  | { page: "login" }
  | { page: "guest" }
  | { page: "register" }
  | { page: "account" }
  | { page: "offline" }
  | { page: "play"; caseId: string }
  | { page: "playtest" }
  | { page: "editor"; caseId?: string; section?: string }
  | { page: "admin"; section: "users" | "groups" | "events" | "settings"; userId?: number; eventId?: number | "new" };

/** Разобрать путь (`/admin/users/12`, без query). */
export function parseRoute(path: string): Route {
  const parts = path.split("/").filter(Boolean);
  switch (parts[0]) {
    case "cases":
    case "howto":
    case "results":
    case "login":
    case "guest":
    case "register":
    case "account":
    case "offline":
      return { page: parts[0] };
    case "play":
      return parts[1] ? { page: "play", caseId: decodeURIComponent(parts[1]) } : { page: "cases" };
    case "playtest":
      return { page: "playtest" };
    case "editor":
      return { page: "editor", ...(parts[1] ? { caseId: decodeURIComponent(parts[1]) } : {}), ...(parts[2] ? { section: parts[2] } : {}) };
    case "admin": {
      const section = parts[1] === "groups" || parts[1] === "events" || parts[1] === "settings" ? parts[1] : "users";
      const userId = section === "users" && parts[2] ? Number(parts[2]) : undefined;
      const eventId = section === "events" && parts[2] ? (parts[2] === "new" ? "new" : Number(parts[2])) : undefined;
      return {
        page: "admin",
        section,
        userId: Number.isFinite(userId) ? userId : undefined,
        ...(eventId === "new" || Number.isFinite(eventId) ? { eventId } : {}),
      };
    }
    default:
      return { page: "home" };
  }
}

/** Путь страницы. */
export function routeHref(r: Route): string {
  if (r.page === "home") return "/";
  if (r.page === "play") return `/play/${encodeURIComponent(r.caseId)}`;
  if (r.page === "admin") return `/admin/${r.section}${r.userId ? `/${r.userId}` : r.eventId ? `/${r.eventId}` : ""}`;
  if (r.page === "editor") return r.caseId ? `/editor/${encodeURIComponent(r.caseId)}${r.section ? `/${r.section}` : ""}` : "/editor";
  return `/${r.page}`;
}

const toPath = (to: Route | string) => (typeof to === "string" ? to : routeHref(to));

/** Адрес для `<a href>`: путь, а в офлайн-файле — путь после `#`. */
export const href = (to: Route | string) => (OFFLINE ? `#${toPath(to)}` : toPath(to));

/** Адрес сайта целиком (для «скопировать адрес»): без страницы и параметров. */
export const siteUrl = () => (OFFLINE ? location.href.split("#")[0] : `${location.origin}/`);

const ROUTE_EVENT = "app:navigate";

/** Текущие путь и query: у офлайн-файла из `#`, иначе из адресной строки. */
function readLocation(): { path: string; search: string } {
  if (typeof location === "undefined") return { path: "/", search: "" };
  if (OFFLINE) {
    const [path, search = ""] = location.hash.replace(/^#/, "").split("?");
    return { path: path || "/", search: search ? `?${search}` : "" };
  }
  return { path: location.pathname, search: location.search };
}
const snapshot = () => {
  const { path, search } = readLocation();
  return path + search;
};

/** Подписка на смену адреса (переход, «назад/вперёд»). */
export function subscribeRoute(listener: () => void) {
  const events = OFFLINE ? ["hashchange"] : ["popstate", ROUTE_EVENT];
  events.forEach((e) => window.addEventListener(e, listener));
  return () => events.forEach((e) => window.removeEventListener(e, listener));
}

/** Страница по текущему адресу (без подписки — для обработчиков). */
export const currentRoute = (): Route => parseRoute(readLocation().path);

/** Параметр адреса без подписки — для обработчиков. */
export const currentSearchParam = (name: string): string | null => new URLSearchParams(readLocation().search).get(name);

export function useRoute(): Route {
  useSyncExternalStore(subscribeRoute, snapshot, () => "/");
  return parseRoute(readLocation().path);
}

/** Значение параметра адреса (`?join=…`, `?item=…`) — перерисовывается при смене адреса. */
export function useSearchParam(name: string): string | null {
  useSyncExternalStore(subscribeRoute, snapshot, () => "/");
  return new URLSearchParams(readLocation().search).get(name);
}

/** Перейти на страницу; страница прокручивается наверх (`scroll: false` — нет). `replace` — не добавлять запись в историю. */
export function navigate(to: Route | string, { replace = false, scroll = true }: { replace?: boolean; scroll?: boolean } = {}) {
  if (typeof location === "undefined") return;
  const path = toPath(to);
  if (OFFLINE) {
    if (location.hash !== `#${path}`) location.hash = path;
  } else if (location.pathname + location.search !== path) {
    history[replace ? "replaceState" : "pushState"](null, "", path);
    window.dispatchEvent(new Event(ROUTE_EVENT));
  }
  if (scroll) window.scrollTo?.(0, 0);
}

/** Изменить параметры адреса (`null` — убрать), не добавляя записи в историю и не прокручивая страницу. В офлайн-файле адрес не хранится. */
export function setSearchParams(updates: Record<string, string | null>) {
  if (typeof location === "undefined" || OFFLINE) return;
  const params = new URLSearchParams(location.search);
  for (const [name, value] of Object.entries(updates)) {
    if (value === null || value === "") params.delete(name);
    else params.set(name, value);
  }
  const search = params.toString();
  navigate(location.pathname + (search ? `?${search}` : ""), { replace: true, scroll: false });
}

/** Ссылка на страницу сайта: обычный `<a>`, но переход без перезагрузки страницы. */
export function Link({ to, onClick, ...rest }: { to: Route | string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // с модификаторами и не левой кнопкой — поведение браузера (новая вкладка); в офлайн-файле хватает хэша
    if (e.defaultPrevented || OFFLINE || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
    e.preventDefault();
    navigate(to);
  };
  return createElement("a", { ...rest, href: href(to), onClick: handle });
}
