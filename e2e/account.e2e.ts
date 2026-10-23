/* eslint-disable @typescript-eslint/no-explicit-any -- код внутри page.evaluate работает с window.__game */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, start, type Harness } from "./harness";

let h: Harness;
beforeAll(async () => {
  h = await start({ api: true });
});
afterAll(() => h.stop());

describe("учётная запись против сервера (PGlite)", () => {
  it("регистрация, выход и повторный вход", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/register`);
    const inputs = page.locator("form input.input");
    await inputs.nth(0).fill("Иванова Анна Сергеевна");
    await inputs.nth(1).fill("ivanova");
    await inputs.nth(2).fill("password123");
    await inputs.nth(3).fill("password123");
    await page.locator("form input[type=checkbox]").check();
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();

    const login = () => page.evaluate(async () => (await (await fetch("/api/me")).json()).login ?? null);
    await expect.poll(login).toBe("ivanova");

    await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
    expect(await login()).toBeNull();
    await page.goto(`${BASE}/login`);
    await page.reload(); // клиент заново спрашивает сервер, кто вошёл
    await page.locator("form input.input").first().fill("ivanova");
    await page.locator("form input[type=password]").fill("password123");
    await page.locator("form button.btn--primary, form button[type=submit]").last().click();
    await expect.poll(login).toBe("ivanova");
    await page.close();
  });

  it("страницы админки работают по глубоким адресам (запросы к API не зависят от пути страницы)", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/login`);
    await page.locator("form input.input").first().fill("admin");
    await page.locator("form input[type=password]").fill("adminpass1");
    await page.locator("form button.btn--primary, form button[type=submit]").last().click();
    await expect.poll(() => page.evaluate(async () => (await (await fetch("/api/me")).json()).login ?? null)).toBe("admin");
    for (const path of ["/admin/users", "/admin/groups", "/admin/settings"]) {
      await page.goto(`${BASE}${path}`);
      await page.locator(".page h1").first().waitFor();
    }
    await page.goto(`${BASE}/admin/users`);
    await expect.poll(() => page.locator("table.table tbody tr").count()).toBeGreaterThan(0);
    // меню пользователя: стрелки ходят по пунктам, Esc закрывает и возвращает фокус на кнопку
    await page.locator(".user-menu__button").click();
    expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("menuitem");
    await page.keyboard.press("ArrowDown");
    const second = await page.evaluate(() => document.activeElement?.textContent);
    await page.keyboard.press("ArrowUp");
    expect(await page.evaluate(() => document.activeElement?.textContent)).not.toBe(second);
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.activeElement?.className)).toContain("user-menu__button");
    // строка таблицы доступна с клавиатуры: первая в Tab, Enter открывает пользователя
    expect(await page.locator("tr.is-link").first().getAttribute("tabindex")).toBe("0");
    await page.locator("tr.is-link").first().focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => location.pathname)).toMatch(/^\/admin\/users\/\d+$/);
    await page.close();
  });

  it("админка: группа открывается по ссылке, из группы — список её студентов", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/login`);
    await page.locator("form input.input").first().fill("admin");
    await page.locator("form input[type=password]").fill("adminpass1");
    await page.locator("form button.btn--primary, form button[type=submit]").last().click();
    await expect.poll(() => page.evaluate(async () => (await (await fetch("/api/me")).json()).login ?? null)).toBe("admin");
    const id = await page.evaluate(async () => {
      const res = await fetch("/api/admin/groups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "ЮР-777" }) });
      return (await res.json()).id as number;
    });
    await page.goto(`${BASE}/admin/groups?group=${id}`);
    await page.getByRole("link", { name: /Показать студентов группы/ }).click();
    await expect.poll(() => page.evaluate(() => location.pathname + location.search)).toBe(`/admin/users?group=${id}`);
    await page.close();
  });

  it("тестовый запуск из конструктора с учётной записью: сразу начинается расследование, поверх баннер «вернуться в конструктор»", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/login`);
    await page.locator("form input.input").first().fill("admin");
    await page.locator("form input[type=password]").fill("adminpass1");
    await page.locator("form button.btn--primary, form button[type=submit]").last().click();
    await expect.poll(() => page.evaluate(async () => (await (await fetch("/api/me")).json()).login ?? null)).toBe("admin");
    await page.goto(`${BASE}/editor`);
    await page.locator(".eh__case", { hasText: "Чужие письма" }).getByRole("button", { name: "Открыть" }).click();
    await page.getByRole("button", { name: "Запустить" }).first().click();
    await page.waitForTimeout(2500);
    const state = await page.evaluate(() => ({
      screen: (window as any).__game?.store.get().screen,
      caseId: (window as any).__game?.store.get().caseFile?.id,
      banner: !!document.querySelector(".playtest-banner"),
    }));
    expect(state).toEqual({ screen: "play", caseId: "case-001", banner: true });
    await page.close();
  });
});
