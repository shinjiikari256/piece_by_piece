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
  await page.goto(`${BASE}/cases`);
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
    expect(new URL(page.url()).pathname).toBe("/play/case-001");
    await page.reload();
    // адрес расследования возвращает в игру по сохранению, без вступления
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play");
    expect(await page.evaluate(() => (window as any).__game.store.get().progress.collected.length)).toBe(collected);
    await page.close();
  });

  it("«назад» из игры спрашивает про выход, выход ведёт к списку дел", async () => {
    const page = await h.page();
    await startCase(page);
    await page.goBack();
    await page.waitForFunction(() => (window as any).__game.store.get().overlay?.kind === "exit");
    expect(new URL(page.url()).pathname).toBe("/play/case-001");
    await page.getByRole("button", { name: "Сохранить и выйти" }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "menu");
    expect(new URL(page.url()).pathname).toBe("/cases");
    await page.close();
  });

  it("адрес неизвестного дела ведёт к списку дел", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/play/net-takogo`);
    await page.waitForURL(`${BASE}/cases`);
    await page.close();
  });

  it("Enter на вступлении начинает расследование (фокус не остаётся на карточке дела под окном)", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/cases`);
    await page.locator("button.case-file").first().click();
    await page.getByRole("button", { name: "Приступить к расследованию" }).waitFor();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play");
    await page.close();
  });

  it("решение проходится с клавиатуры: фокус остаётся в окне, Tab/Enter ведут по шагам", async () => {
    const page = await h.page();
    await startCase(page);
    await page.evaluate(() => (window as any).__game.actions.goFinal());
    const inside = () => page.evaluate(() => !!document.activeElement?.closest(".backdrop"));
    // Tab ходит по кругу внутри окна, не уходя в страницу под ним
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      expect(await inside()).toBe(true);
    }
    // с модификатором цифры и стрелки браузеру, а не игре
    await page.keyboard.press("Control+Digit1");
    expect(await page.evaluate(() => Object.keys((window as any).__game.store.get().answers).length)).toBe(0);
    await page.keyboard.press("Digit1");
    expect(await page.evaluate(() => Object.keys((window as any).__game.store.get().answers).length)).toBe(1);
    // стрелки вверх/вниз ходят по вариантам, пробел выбирает и снимает выбор
    const focused = () => page.evaluate(() => document.activeElement?.className ?? "");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toContain("answer-opt");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    expect(await page.evaluate(() => (window as any).__game.store.get().answers.q_right)).toHaveLength(1);
    await page.keyboard.press("ArrowUp");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-pressed"))).toBe("false");
    // единственный выбор: Enter на варианте выбирает его и идёт дальше
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => (window as any).__game.store.get().answers.q_right)).toHaveLength(1);
    await page.getByText("Вопрос 2 из 5").waitFor();
    // Enter без фокуса на варианте — «Далее»
    await page.keyboard.press("Enter");
    await page.getByText("Вопрос 3 из 5").waitFor();
    // Enter на «Далее» с клавиатуры; после перехода фокус не теряется
    for (let step = 0; step < 3; step++) {
      while (!/Далее|К решению/.test((await page.evaluate(() => document.activeElement?.textContent)) ?? "")) await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
    }
    await page.getByRole("heading", { name: "Решение" }).waitFor();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("H2");
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
    await page.goto(`${BASE}/editor`);
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

  it("конструктор: дело и раздел — в адресе; перезагрузка и «назад» возвращают на то же место", async () => {
    const page = await h.page();
    const path = () => page.evaluate(() => location.pathname);
    await page.goto(`${BASE}/editor`);
    await page.waitForFunction(() => (window as any).__editor);
    expect(await path()).toBe("/editor");
    await page.locator(".eh__case", { hasText: "Чужие письма" }).getByRole("button", { name: "Открыть" }).click();
    await expect.poll(path).toBe("/editor/case-001/general");
    await page.evaluate(() => (window as any).__editor.editor.goto("locations"));
    await expect.poll(path).toBe("/editor/case-001/locations");
    await page.reload();
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    expect(await page.evaluate(() => (window as any).__editor.editorStore.get().section)).toBe("locations");
    await page.goBack();
    await expect.poll(() => page.evaluate(() => (window as any).__editor.editorStore.get().section)).toBe("general");
    await page.locator(".ed__home").click();
    await expect.poll(path).toBe("/editor");
    await page.close();
  });

  it("конструктор: выбранный элемент и вкладка — в адресе и переживают перезагрузку", async () => {
    const page = await h.page();
    const query = () => page.evaluate(() => location.search);
    await page.goto(`${BASE}/editor/case-001/evidence`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    // первый элемент открыт по умолчанию — и уже записан в адрес
    await expect.poll(query).toMatch(/item=mail_log/);
    await page.locator(".ed__list .ed__item").nth(2).click();
    await expect.poll(query).toMatch(/item=(?!mail_log)/);
    const title = await page.locator(".ed__list .ed__item[aria-current]").innerText();
    await page.getByRole("tab", { name: "Связи" }).click();
    await expect.poll(query).toMatch(/tab=links/);
    await page.reload();
    await page.waitForSelector(".ed__list .ed__item[aria-current]");
    expect(await page.locator(".ed__list .ed__item[aria-current]").innerText()).toBe(title);
    expect(await page.getByRole("tab", { name: "Связи" }).getAttribute("aria-selected")).toBe("true");
    // раздел сменился — параметры сброшены
    await page.evaluate(() => (window as any).__editor.editor.goto("locations"));
    await expect.poll(() => page.evaluate(() => location.pathname + location.search)).toMatch(/^\/editor\/case-001\/locations\?item=(?!mail_log)[\w-]+$/);
    await page.locator(".lm__tabs .tab", { hasText: "+ локация" }).waitFor();
    await page.close();
  });

  it("конструктор: «Запустить» сразу начинает расследование по тестовой копии дела", async () => {
    const page = await h.page();
    // у игрока уже есть сохранённое расследование этого дела — тестовый запуск о нём не спрашивает
    await startCase(page);
    await page.evaluate(() => {
      const { actions } = (window as any).__game;
      actions.interact("obj_computer");
      actions.addObjectToJournal("obj_computer");
      actions.close();
    });
    await page.goto(`${BASE}/editor`);
    await page.locator(".eh__case", { hasText: "Чужие письма" }).getByRole("button", { name: "Открыть" }).click();
    await page.getByRole("button", { name: "Запустить" }).first().click();
    await page.waitForFunction(() => (window as any).__game?.store.get().caseFile?.id === "case-001");
    // без вступления и без вопроса о прошлом сохранении
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play");
    expect(await page.evaluate(() => !!document.querySelector(".playtest-banner"))).toBe(true);
    expect(await page.getByRole("button", { name: "Начать заново" }).count()).toBe(0);
    expect(new URL(page.url()).pathname).toBe("/playtest");
    // в шапке вместо «в главное меню» — стрелка назад в конструктор; сначала спрашивает про выход
    await page.locator("a.topbar__home").click();
    await page.getByRole("button", { name: "Сохранить и выйти" }).click();
    await expect.poll(() => page.evaluate(() => location.pathname)).toBe("/editor");
    await page.close();
  });

  it("тема: ?theme= включает и запоминает, ?theme=default сбрасывает; параметр из адреса убирается", async () => {
    const page = await h.page();
    const state = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme ?? null, url: location.pathname + location.search }));
    await page.goto(`${BASE}/cases?theme=salad`);
    expect(await state()).toEqual({ theme: "salad", url: "/cases" });
    await page.goto(`${BASE}/results`);
    expect((await state()).theme).toBe("salad");
    await page.goto(`${BASE}/results?theme=default`);
    expect(await state()).toEqual({ theme: null, url: "/results" });
    await page.goto(`${BASE}/cases`);
    expect((await state()).theme).toBeNull();
    await page.close();
  });

  it("тема: переключатель в шапке меняет и запоминает тему", async () => {
    const page = await h.page();
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? null);
    await page.goto(`${BASE}/cases`);
    await page.getByRole("button", { name: "Тема оформления" }).click();
    await page.getByRole("menuitemradio", { name: /Салатная/ }).click();
    expect(await theme()).toBe("salad");
    await page.reload();
    expect(await theme()).toBe("salad");
    await page.getByRole("button", { name: "Тема оформления" }).click();
    expect(await page.getByRole("menuitemradio", { name: /Салатная/ }).getAttribute("aria-checked")).toBe("true");
    await page.getByRole("menuitemradio", { name: /Обычная/ }).click();
    expect(await theme()).toBeNull();
    await page.reload();
    expect(await theme()).toBeNull();
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
