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
    await page.goto(`${BASE}/#/register`);
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
    await page.goto(`${BASE}/#/login`);
    await page.reload(); // клиент заново спрашивает сервер, кто вошёл
    await page.locator("form input.input").first().fill("ivanova");
    await page.locator("form input[type=password]").fill("password123");
    await page.locator("form button.btn--primary, form button[type=submit]").last().click();
    await expect.poll(login).toBe("ivanova");
    await page.close();
  });
});
