import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, overflow, start, type Harness } from "./harness";

let h: Harness;
beforeAll(async () => {
  h = await start({ api: true });
});
afterAll(() => h.stop());

describe.each([
  { name: "телефон", width: 390, height: 844 },
  { name: "планшет", width: 768, height: 1024 },
])("$name: админка и личные страницы помещаются", ({ width, height }) => {
  it.each(["/account", "/offline", "/admin/users", "/admin/groups", "/admin/settings"])("страница %s", async (path) => {
    const page = await h.page();
    await page.setViewportSize({ width, height });
    await page.goto(`${BASE}/login`);
    await page.locator("form input.input").first().fill("admin");
    await page.locator("form input[type=password]").fill("adminpass1");
    await page.locator("form button.btn--primary, form button[type=submit]").last().click();
    await expect.poll(() => page.evaluate(async () => (await (await fetch("/api/me")).json()).login ?? null)).toBe("admin");
    await page.goto(`${BASE}${path}`);
    await page.locator(".page h1, h1").first().waitFor();
    await page.waitForTimeout(300);
    const o = await overflow(page);
    expect(o.page, `шире окна: ${o.wide.join(", ")}`).toBeLessThanOrEqual(0);
    expect(o.wide).toEqual([]);
    await page.close();
  });
});
