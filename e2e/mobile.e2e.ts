/* eslint-disable @typescript-eslint/no-explicit-any -- код внутри page.evaluate работает с window.__game */
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, start, type Harness } from "./harness";

let h: Harness;
beforeAll(async () => {
  h = await start();
});
afterAll(() => h.stop());

const SIZES = [
  { name: "телефон", width: 390, height: 844 },
  { name: "планшет", width: 768, height: 1024 },
];

/** Элементы, вылезающие за ширину окна (кроме тех, что прокручиваются своим контейнером). */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const w = doc.clientWidth;
    const scrolls = (el: Element | null) => {
      for (let e = el?.parentElement; e && e !== doc; e = e.parentElement) {
        if (/auto|scroll|hidden/.test(getComputedStyle(e).overflowX)) return true;
      }
      return false;
    };
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > w + 1 || r.left < -1) && !scrolls(el);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
    return { page: doc.scrollWidth - w, wide };
  });
}

describe.each(SIZES)("$name: нет горизонтального переполнения", ({ width, height }) => {
  const open = async (path: string) => {
    const page = await h.page();
    await page.setViewportSize({ width, height });
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(400);
    return page;
  };

  it.each(["/", "/cases", "/howto", "/login", "/register", "/results"])("страница %s", async (path) => {
    const page = await open(path);
    const o = await overflow(page);
    expect(o.page, `scrollWidth больше окна; шире окна: ${o.wide.join(", ")}`).toBeLessThanOrEqual(0);
    expect(o.wide).toEqual([]);
  });

  it("игра: шапка, нижняя панель и журнал помещаются", async () => {
    const page = await open("/cases");
    await page.locator("button.case-file").first().click();
    await page.getByRole("button", { name: "Приступить к расследованию" }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play");
    expect(await overflow(page)).toMatchObject({ page: 0, wide: [] });
    // шапка: две строки, кнопка выхода и «Как играть» видны и нажимаемы
    for (const sel of [".topbar__home, .topbar__case button", ".topbar__help", ".topbar__notes", ".topbar__progress"]) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box, sel).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    }
    await page.evaluate(() => (window as any).__game.actions.open({ kind: "journal", tab: "materials" }));
    await page.waitForSelector(".tabbed-modal");
    expect(await overflow(page)).toMatchObject({ page: 0, wide: [] });
    const modal = await page.locator(".tabbed-modal").boundingBox();
    expect(modal!.x + modal!.width).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press("Escape");
    await page.waitForSelector(".tabbed-modal", { state: "detached" });
  });
});
