import { describe, expect, it } from "vitest";
import { parseRoute, routeHref, type Route } from "./router";

describe("маршруты сайта", () => {
  const routes: [string, Route][] = [
    ["/", { page: "home" }],
    ["/cases", { page: "cases" }],
    ["/howto", { page: "howto" }],
    ["/results", { page: "results" }],
    ["/login", { page: "login" }],
    ["/account", { page: "account" }],
    ["/play/case-001", { page: "play", caseId: "case-001" }],
    ["/playtest", { page: "playtest" }],
    ["/editor", { page: "editor" }],
    ["/editor/case-001", { page: "editor", caseId: "case-001" }],
    ["/editor/case-001/locations", { page: "editor", caseId: "case-001", section: "locations" }],
    ["/admin/users", { page: "admin", section: "users" }],
    ["/admin/users/12", { page: "admin", section: "users", userId: 12 }],
    ["/admin/groups", { page: "admin", section: "groups" }],
    ["/admin/settings", { page: "admin", section: "settings" }],
  ];

  it.each(routes)("%s ↔ маршрут", (path, route) => {
    expect(parseRoute(path)).toEqual(route);
    expect(routeHref(route)).toBe(path);
  });

  it("неизвестный адрес ведёт на главную, лишние слэши не мешают", () => {
    expect(parseRoute("/нет-такой")).toEqual({ page: "home" });
    expect(parseRoute("//cases//")).toEqual({ page: "cases" });
  });

  it("раздел админки по умолчанию — пользователи; id не число — без id", () => {
    expect(parseRoute("/admin")).toEqual({ page: "admin", section: "users" });
    expect(parseRoute("/admin/users/abc")).toEqual({ page: "admin", section: "users" });
  });
});
