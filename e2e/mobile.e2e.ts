/* eslint-disable @typescript-eslint/no-explicit-any -- код внутри page.evaluate работает с window.__game */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, overflow, start, type Harness } from "./harness";

let h: Harness;
beforeAll(async () => {
  h = await start();
});
afterAll(() => h.stop());

const SIZES = [
  { name: "телефон", width: 390, height: 844 },
  { name: "планшет", width: 768, height: 1024 },
];

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

  it("окно-папка занимает всю высоту без полосы снизу", async () => {
    const page = await open("/cases");
    await page.locator("button.case-file").first().click();
    await page.getByRole("button", { name: "Приступить к расследованию" }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play");
    await page.evaluate(() => (window as any).__game.actions.open({ kind: "journal", tab: "materials" }));
    await page.waitForSelector(".tabbed-modal");
    const box = await page.locator(".tabbed-modal").boundingBox();
    if (width <= 640) expect(Math.round(box!.y + box!.height)).toBe(height);
  });

  /** Игра с двумя собранными уликами (store мутируется на месте — как делают прочие тесты). */
  const playWithEvidence = async () => {
    const page = await open("/cases");
    await page.locator("button.case-file").first().click();
    await page.getByRole("button", { name: "Приступить к расследованию" }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play");
    await page.evaluate(() => {
      const { store } = (window as any).__game;
      const ids = store
        .get()
        .caseFile.evidence.filter((e: any) => (e.kind ?? "evidence") === "evidence")
        .slice(0, 3)
        .map((e: any) => e.id);
      store.get().progress.collected.push(...ids);
    });
    return page;
  };

  it("хронология помещается", async () => {
    const page = await playWithEvidence();
    await page.evaluate(() => (window as any).__game.actions.open({ kind: "journal", tab: "timeline" }));
    await page.waitForSelector(".tabbed-modal");
    expect(await overflow(page)).toMatchObject({ page: 0, wide: [] });
  });
});

describe("касание: перетаскивание карточки в ячейку сопоставления", () => {
  it("удержание и перенос кладёт карточку в ячейку", async () => {
    const ctx = await h.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/cases`);
    await page.locator("button.case-file").first().click();
    await page.getByRole("button", { name: "Приступить к расследованию" }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play");
    await page.evaluate(() => {
      const { store, actions } = (window as any).__game;
      const ids = store
        .get()
        .caseFile.evidence.filter((e: any) => (e.kind ?? "evidence") === "evidence")
        .slice(0, 3)
        .map((e: any) => e.id);
      store.get().progress.collected.push(...ids);
      actions.open({ kind: "journal", tab: "materials", match: true });
    });
    await page.waitForSelector("[data-slot]");
    const before = await page.evaluate(() => document.querySelector("[data-slot]")?.textContent?.trim() ?? "");
    const from = (await page.locator("[data-mark-key]").first().boundingBox())!;
    const to = (await page.locator("[data-slot]").first().boundingBox())!;
    const cdp = await ctx.newCDPSession(page);
    const pt = (x: number, y: number) => [{ x, y }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(from.x + 20, from.y + 20) });
    await page.waitForTimeout(400);
    for (let i = 1; i <= 5; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: pt(from.x + 20 + ((to.x + to.width / 2 - from.x - 20) * i) / 5, from.y + 20 + ((to.y + to.height / 2 - from.y - 20) * i) / 5),
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.evaluate(() => document.querySelector("[data-slot]")?.textContent?.trim() ?? ""), { timeout: 3000 }).not.toBe(before);
  });
});

describe("конструктор: поворот экрана", () => {
  it("правка не теряется при смене ориентации", async () => {
    const page = await h.page();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/editor`);
    await page.waitForFunction(() => (window as any).__editor);
    await page
      .getByRole("button", { name: /Новое дело|Создать/i })
      .first()
      .click()
      .catch(() => undefined);
    const before = await page.evaluate(() => JSON.stringify((({ screen, section, draft, dirty }) => ({ screen, section, draft, dirty }))((window as any).__editor.editorStore.get())));
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => JSON.stringify((({ screen, section, draft, dirty }) => ({ screen, section, draft, dirty }))((window as any).__editor.editorStore.get())));
    expect(after).toBe(before);
    expect(await overflow(page)).toMatchObject({ page: 0 });
  });
});
