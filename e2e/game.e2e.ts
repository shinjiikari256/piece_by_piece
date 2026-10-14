/* eslint-disable @typescript-eslint/no-explicit-any -- код внутри page.evaluate работает с window.__game */
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, start, type Harness } from "./harness";

const SECTIONS = ["general", "characters", "locations", "evidence", "events", "dialogues", "confrontations", "deductions", "hints", "questions", "solution", "law", "flags", "json", "errors"];
let h: Harness;
beforeAll(async () => {
  h = await start();
});
afterAll(() => h.stop());

/** Открыть дело №001 через интерфейс и начать расследование. */
async function startCase(page: Page) {
  await page.goto(`${BASE}/#/cases`);
  await page.locator("button.case-file").first().click();
  await page.getByRole("button", { name: "Приступить к расследованию" }).click();
  await page.waitForFunction(() => (window as any).__game.store.get().screen === "play");
}

describe("игра в браузере", () => {
  it("дело №001 проходится до результата", async () => {
    const page = await h.page();
    await startCase(page);
    const result = await page.evaluate(async () => {
      const { actions, store } = (window as any).__game;
      const talk = (npc: string, ...choices: string[]) => {
        actions.interact(npc);
        choices.forEach((c) => actions.choose(c));
        actions.close();
      };
      const examine = (id: string) => {
        actions.interact(id);
        actions.addObjectToJournal(id);
        actions.close();
      };
      talk("npc_alina", "what", "back", "pass", "back");
      talk("npc_gusev", "key", "back");
      ["obj_computer", "obj_desk", "obj_cabinet", "obj_board", "obj_guard_post"].forEach(examine);
      talk("npc_lebedeva", "quote", "back");
      // верные ответы сопоставлений: перебор вариантов, пока судья не подтвердит
      for (const d of store.get().caseFile.deductions) {
        for (const o of d.options) if ((await actions.answerDeduction(d.id, o.id))?.correct) break;
      }
      talk("npc_krylov", "log", "keys");
      actions.goFinal();
      actions.setAnswer("q_right", ["correspondence_secrecy"]);
      actions.setAnswer("q_violation", ["yes"]);
      actions.setAnswer("q_qualification", ["criminal"]);
      actions.setAnswer("q_responsible", ["krylov"]);
      actions.setAnswer("q_evidence", ["mail_log", "krylov_admission", "printout", "teacher_testimony", "alina_testimony", "key_log", "mail_policy"]);
      await actions.submit();
      return { screen: store.get().screen, total: store.get().score?.total };
    });
    expect(result.screen).toBe("result");
    expect(result.total).toBeGreaterThanOrEqual(100);
    await page.close();
  });

  it("перезагрузка посреди игры: расследование можно продолжить", async () => {
    const page = await h.page();
    await startCase(page);
    await page.evaluate(() => {
      const { actions } = (window as any).__game;
      actions.interact("npc_alina");
      actions.choose("what");
      actions.close();
    });
    const collected = await page.evaluate(() => (window as any).__game.store.get().progress.collected.length);
    await page.waitForTimeout(500); // автосохранение
    await page.reload();
    await page.goto(`${BASE}/#/cases`);
    await page.locator("button.case-file").first().click();
    await page.getByRole("button", { name: /Продолжить/ }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play");
    expect(await page.evaluate(() => (window as any).__game.store.get().progress.collected.length)).toBe(collected);
    await page.close();
  });

  it("окна открываются и закрываются", async () => {
    const page = await h.page();
    await startCase(page);
    const overlay = () => page.evaluate(() => (window as any).__game.store.get().overlay?.kind ?? null);
    const notes = () => page.evaluate(() => (window as any).__game.store.get().notesOpen ?? null);

    await page.keyboard.press("KeyM");
    expect(await overlay()).toBe("journal");
    await page.evaluate(() => (window as any).__game.actions.close());
    expect(await overlay()).toBeNull();

    await page.keyboard.press("KeyH");
    expect(await overlay()).toBe("hints");
    await page.evaluate(() => (window as any).__game.actions.close());

    await page.evaluate(() => (window as any).__game.actions.interact("npc_alina"));
    expect(await overlay()).toBe("dialogue");
    await page.evaluate(() => (window as any).__game.actions.close());

    await page.evaluate(() => (window as any).__game.actions.interact("obj_computer"));
    expect(await overlay()).toBe("object");
    await page.evaluate(() => (window as any).__game.actions.close());

    await page.locator("button.topbar__notes").click();
    expect(await notes()).toBe(true);
    await page.keyboard.press("Escape");
    expect(await notes()).toBe(false);
    await page.close();
  });

  it("сцена оживает: персонаж идёт по стрелкам, сохраняется позиция", async () => {
    const page = await h.page();
    await startCase(page);
    await page.waitForFunction(() => (window as any).__scene?.player);
    const x0 = await page.evaluate(() => (window as any).__scene.player.x);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(600);
    await page.keyboard.up("ArrowRight");
    const x1 = await page.evaluate(() => (window as any).__scene.player.x);
    expect(x1).toBeGreaterThan(x0);
    await page.close();
  });

  it("конструктор открывается и переключает разделы без ошибок", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/#/editor`);
    await page.waitForFunction(() => (window as any).__editor);
    await page.evaluate(() => {
      const { editor, editorStore } = (window as any).__editor;
      editor.open(editorStore.get().draft);
    });
    for (const section of SECTIONS) {
      await page.evaluate((id) => (window as any).__editor.editor.goto(id), section);
      await page.waitForTimeout(150);
      expect(await page.locator("body").innerText(), section).not.toBe("");
    }
    await page.close();
  });

  it("окно решения: Esc возвращает в игру, ответы остаются, без ответов решение вынести нельзя", async () => {
    const page = await h.page();
    await startCase(page);
    const game = () => page.evaluate(() => ({ screen: (window as any).__game.store.get().screen, answers: (window as any).__game.store.get().answers }));
    await page.keyboard.press("KeyV");
    expect((await game()).screen).toBe("final");
    // вопрос с вариантами: выбрать первый вариант цифрой
    await page.locator("button.answer-opt").first().click();
    expect(await page.locator(".folder__tab--btn", { hasText: "Право" }).locator("svg").count()).toBe(1); // отметка «есть ответ»
    await page.keyboard.press("Escape");
    const back = await game();
    expect(back.screen).toBe("play");
    expect(Object.keys(back.answers)).toHaveLength(1);

    await page.keyboard.press("KeyV");
    await page.getByRole("tab", { name: /Решение/ }).click();
    expect(await page.locator(".tabbed-modal").getByRole("button", { name: "Вынести решение" }).isDisabled()).toBe(true);
    // номер и название дела внутри окна не пишем
    expect(await page.locator(".tabbed-modal").innerText()).not.toMatch(/Чужие письма/);
    await page.close();
  });
});
