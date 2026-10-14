import { useSyncExternalStore } from "react";

/**
 * Страницы сайта — по hash-адресу (`#/cases`, `#/account`, `#/admin/users/12`).
 * Hash, а не обычные пути: игра открывается и как файл с диска (офлайн-сборка), и с любого подкаталога.
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
  | { page: "editor" }
  | { page: "admin"; section: "users" | "groups" | "settings"; userId?: number };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  switch (parts[0]) {
    case "cases":
    case "howto":
    case "results":
    case "login":
    case "guest":
    case "register":
    case "account":
    case "editor":
      return { page: parts[0] };
    case "admin": {
      const section = parts[1] === "groups" || parts[1] === "settings" ? parts[1] : "users";
      const userId = section === "users" && parts[2] ? Number(parts[2]) : undefined;
      return { page: "admin", section, userId: Number.isFinite(userId) ? userId : undefined };
    }
    default:
      return { page: "home" };
  }
}

export function routeHref(r: Route): string {
  if (r.page === "home") return "#/";
  if (r.page === "admin") return `#/admin/${r.section}${r.userId ? `/${r.userId}` : ""}`;
  return `#/${r.page}`;
}

const subscribe = (l: () => void) => {
  window.addEventListener("hashchange", l);
  return () => window.removeEventListener("hashchange", l);
};
const getHash = () => (typeof location === "undefined" ? "" : location.hash);

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => "");
  return parseRoute(hash);
}

/** Перейти на страницу; страница прокручивается наверх. */
export function navigate(to: Route | string) {
  if (typeof location === "undefined") return;
  const href = typeof to === "string" ? to : routeHref(to);
  if (location.hash !== href) location.hash = href;
  window.scrollTo?.(0, 0);
}
