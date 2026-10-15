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

  it("журнал с клавиатуры: ↑/↓ ходят по карточкам материалов и фигурантов, Enter открывает", async () => {
    const page = await h.page();
    await startCase(page);
    await page.evaluate(() => {
      const { actions } = (window as any).__game;
      for (const id of ["obj_computer", "obj_desk"]) {
        actions.interact(id);
        actions.addObjectToJournal(id);
        actions.close();
      }
    });
    await page.keyboard.press("KeyM");
    // ← / → переключают вкладки журнала
    const activeTab = () => page.evaluate(() => document.querySelector('.folder__tab[aria-selected="true"]')?.textContent);
    const before = await activeTab();
    await page.keyboard.press("ArrowRight");
    expect(await activeTab()).not.toBe(before);
    await page.keyboard.press("ArrowLeft");
    expect(await activeTab()).toBe(before);
    await page.locator(".folder__tab", { hasText: "Материалы" }).click();
    const focused = () => page.evaluate(() => document.activeElement?.className ?? "");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toContain("evidence-card");
    const first = await page.evaluate(() => document.activeElement?.textContent);
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => document.activeElement?.textContent)).not.toBe(first);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-pressed"))).toBe("true");
    // C переключает «Сопоставить» / «Изучить»
    await page.keyboard.press("KeyC");
    await page.getByRole("button", { name: /Изучить/ }).waitFor();
    await page.keyboard.press("KeyC");
    await page.getByRole("button", { name: /Сопоставить/ }).waitFor();
    // сопоставление: открытый материал сразу на доске; карточку выбирает пробел, Enter сопоставляет
    await page.keyboard.press("KeyC");
    expect(await page.locator(".pin-slot.is-filled").count()).toBe(1);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter"); // выбор карточки — не Enter: вторая пара не появилась
    expect(await page.locator(".pin-slot.is-filled").count()).toBe(1);
    await page.keyboard.press("Space");
    expect(await page.locator(".pin-slot.is-filled").count()).toBe(2);
    await page.keyboard.press("Enter");
    await page.locator(".board__result .verdict, .board__result .deduction").first().waitFor();
    await page.keyboard.press("KeyC");
    // у фигурантов то же
    await page.locator(".folder__tab", { hasText: "Фигуранты" }).click();
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toContain("person-card");
    await page.close();
  });

  it("варианты сопоставления пронумерованы: стрелки и цифры ходят по ним, а не по карточкам материалов", async () => {
    const page = await h.page();
    await startCase(page);
    const pair = await page.evaluate(() => {
      const { actions, store } = (window as any).__game;
      const talk = (npc: string, ...choices: string[]) => {
        actions.interact(npc);
        choices.forEach((c) => actions.choose(c));
        actions.close();
      };
      talk("npc_alina", "what", "back", "pass", "back");
      talk("npc_gusev", "key", "back");
      ["obj_computer", "obj_desk", "obj_cabinet", "obj_board", "obj_guard_post"].forEach((id) => {
        actions.interact(id);
        actions.addObjectToJournal(id);
        actions.close();
      });
      return store.get().caseFile.deductions[0].evidenceIds as string[];
    });
    await page.keyboard.press("KeyM");
    await page.locator(".folder__tab", { hasText: "Материалы" }).click();
    await page.keyboard.press("KeyC");
    for (const id of pair) await page.locator(`.materials__list [data-mark-key="${id}"]`).click();
    await page.keyboard.press("Enter");
    await page.locator(".deduction__options .choice").first().waitFor();
    expect(await page.locator(".deduction__options .choice__num").allTextContents()).toEqual(["1", "2", "3"].slice(0, await page.locator(".deduction__options .choice").count()));
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => document.activeElement?.classList.contains("choice"))).toBe(true);
    await page.keyboard.press("Digit2");
    expect(await page.evaluate(() => document.activeElement?.querySelector(".choice__num")?.textContent)).toBe("2");
    await page.close();
  });

  it("вкладка «Закон»: стрелки прокручивают текст без перевода фокуса в область просмотра", async () => {
    const page = await h.page();
    await page.setViewportSize({ width: 1000, height: 500 }); // низкое окно: текст закона не помещается
    await startCase(page);
    await page.keyboard.press("KeyM");
    await page.locator(".folder__tab", { hasText: "Закон" }).click();
    const scroller = () =>
      page.evaluate(() => {
        const el = [...document.querySelectorAll(".tabbed-modal *")].find((x) => x.scrollHeight > x.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(x).overflowY));
        return { scrollable: !!el, top: el?.scrollTop ?? 0 };
      });
    expect((await scroller()).scrollable).toBe(true);
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await scroller()).top).toBeGreaterThan(0);
    await page.keyboard.press("Home");
    await expect.poll(async () => (await scroller()).top).toBe(0);
    await page.close();
  });

  it("moveTo: персонаж идёт пешком, пока идёт — поговорить нельзя, пришёл — точка взаимодействия на новом месте", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/play/case-test-moveto`); // тестовое дело — только в режиме разработки
    await page.getByRole("button", { name: /Приступить к расследованию/ }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play" && (window as any).__scene);
    await page.evaluate(() => {
      const { actions } = (window as any).__game;
      actions.interact("npc_timur");
      actions.choose("t_menu");
      actions.choose("t1"); // Тимур идёт в клетку 22,14
      actions.close();
    });
    const state = () => page.evaluate(() => {
      const scene = (window as any).__scene;
      const n = scene.npcs.get("timur");
      const item = scene.interactables.find((i: any) => i.id === "npc_timur");
      return { mode: n.mode, tile: [n.tile.x, n.tile.y], x: n.x, y: n.y, item: [item.x, item.y], label: n.labelText.x, sprite: n.sprite.x, place: (window as any).__game.store.get().progress.npcPlaces.timur };
    });
    // в пути: идёт (не телепорт), итоговое место в состоянии уже записано
    await page.waitForTimeout(600);
    const walking = await state();
    expect(walking.mode).toBe("walker");
    expect(walking.tile).not.toEqual([22, 14]);
    expect(walking.place).toMatchObject({ x: 22, y: 14 });
    // пришёл
    await page.waitForFunction(() => (window as any).__scene.npcs.get("timur").mode === "static", null, { timeout: 25_000 });
    const arrived = await state();
    expect(arrived.tile).toEqual([22, 14]);
    expect(arrived.item).toEqual([arrived.x, arrived.y]); // подсказка «E» меряется от нового места, а не от старого
    expect(arrived.label).toBe(arrived.sprite); // подпись над персонажем
    await page.close();
  });

  it("moveTo: путь закрыт на момент команды (заперта дверь) — персонаж остаётся, итоговое место откатывается", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/play/case-test-moveto`);
    await page.getByRole("button", { name: /Приступить к расследованию/ }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play" && (window as any).__scene);
    await page.evaluate(() => {
      const { actions } = (window as any).__game;
      actions.interact("npc_timur");
      actions.choose("t_menu");
      actions.choose("t3"); // Вика → в комнату 412, а дверь заперта
      actions.close();
    });
    await page.waitForTimeout(500);
    const vika = await page.evaluate(() => ({ mode: (window as any).__scene.npcs.get("vika").mode, place: (window as any).__game.store.get().progress.npcPlaces.vika ?? null }));
    expect(vika).toEqual({ mode: "static", place: null });
    await page.close();
  });

  it("выход рисует карта (лестница), а не стрелка; подпись выхода скрыта, пока не наведёшь или не подойдёшь", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/play/case-test-moveto`);
    await page.getByRole("button", { name: /Приступить к расследованию/ }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play" && (window as any).__scene);
    const info = await page.evaluate(() => {
      const scene = (window as any).__scene;
      const exits = scene.interactables.filter((i: any) => i.id.startsWith("exit:"));
      const stairs = scene.location.tiles.filter((row: string) => row.includes("Z")).length;
      return { count: exits.length, zones: exits.every((i: any) => i.sprite.texture.key === "exit_zone"), hidden: exits.every((i: any) => !i.labelText.visible), stairsRows: stairs, arrows: scene.textures.exists("exit_left") };
    });
    expect(info.count).toBeGreaterThan(0);
    expect(info.zones).toBe(true);
    expect(info.hidden).toBe(true);
    expect(info.stairsRows).toBe(2); // лестница вбок на двух клетках проёма
    expect(info.arrows).toBe(false);
    await page.close();
  });

  it("взаимодействие не проходит сквозь стену: плакат на стене читается только спереди", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/play/case-test-moveto`);
    await page.getByRole("button", { name: /Приступить к расследованию/ }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play" && (window as any).__scene);
    // плакат висит на стене коридора в клетке 17,9: спереди — коридор (17,10), сзади — кухня (17,8)
    const focusFrom = (tx: number, ty: number) =>
      page.evaluate(
        ([x, y]) => {
          const scene = (window as any).__scene;
          scene.player.setPosition((x + 0.5) * 32, (y + 1) * 32 - 2); // TILE = 32 px
          scene.updateFocus(false);
          return scene.focused?.id ?? null;
        },
        [tx, ty],
      );
    expect(await focusFrom(17, 10)).toBe("obj_poster");
    expect(await focusFrom(17, 8)).not.toBe("obj_poster");
    await page.close();
  });

  it("области-триггеры: автозапуск при входе (один раз), запуск по E, первый подходящий диалог", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/play/case-test-moveto`);
    await page.getByRole("button", { name: /Приступить к расследованию/ }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play" && (window as any).__scene);
    const overlay = () => page.evaluate(() => (window as any).__game.store.get().overlay);
    const placeAt = (x: number, y: number) =>
      page.evaluate(([tx, ty]) => (window as any).__scene.player.setPosition((tx + 0.5) * 32, (ty + 1) * 32 - 2), [x, y]);
    // вход в область с автозапуском
    await placeAt(14, 10);
    await page.waitForFunction(() => (window as any).__game.store.get().overlay?.dialogueId === "dlg_zone_auto");
    await page.evaluate(() => (window as any).__game.actions.close());
    // повторный вход — диалог не запускается снова
    await placeAt(10, 12);
    await page.waitForTimeout(200);
    await placeAt(14, 10);
    await page.waitForTimeout(400);
    expect(await overlay()).toBeNull();
    // область без автозапуска: подсказка появляется внутри, E запускает диалог
    await placeAt(23, 13);
    await page.waitForFunction(() => (window as any).__scene.focused?.id === "zone:zone_corridor_end");
    await page.evaluate(() => (window as any).__game.actions.interact("zone:zone_corridor_end"));
    expect((await overlay()).dialogueId).toBe("dlg_zone_e");
    await page.evaluate(() => (window as any).__game.actions.close());
    // два диалога на область: первый подходящий — по условию, иначе по умолчанию
    await page.evaluate(() => (window as any).__game.actions.interact("zone:zone_lobby_center"));
    expect((await overlay()).dialogueId).toBe("dlg_zone_lobby");
    await page.evaluate(() => {
      const { actions } = (window as any).__game;
      actions.close();
      actions.interact("npc_timur");
      actions.choose("t_menu");
      actions.choose("t4"); // Вика идёт за вами
      actions.close();
      actions.interact("zone:zone_lobby_center");
    });
    expect((await overlay()).dialogueId).toBe("dlg_zone_lobby_vika");
    await page.close();
  });

  it("конструктор: инструмент «Область» создаёт именованную область, дорисовывает и стирает клетки", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/locations`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    await page.locator(".lm__tool", { hasText: "Область" }).click();
    const canvas = page.locator(".lm__canvas");
    const box = (await canvas.boundingBox())!;
    const dims = await page.evaluate(() => { const l = (window as any).__editor.editorStore.get().draft.locations[0]; return { w: l.tiles[0].length, h: l.tiles.length }; });
    const cell = (x: number, y: number) => ({ x: box.x + (box.width / dims.w) * (x + 0.5), y: box.y + (box.height / dims.h) * (y + 0.5) });
    const zones = () => page.evaluate(() => (window as any).__editor.editorStore.get().draft.locations[0].zones as { id: string; name: string; cells: { x: number; y: number }[] }[]);
    // мазок по трём клеткам создаёт область
    await page.mouse.move(cell(5, 5).x, cell(5, 5).y);
    await page.mouse.down();
    await page.mouse.move(cell(6, 5).x, cell(6, 5).y, { steps: 3 });
    await page.mouse.move(cell(7, 5).x, cell(7, 5).y, { steps: 3 });
    await page.mouse.up();
    let z = await zones();
    expect(z).toHaveLength(1);
    expect(z[0].cells).toHaveLength(3);
    expect(z[0].name).toMatch(/Область/);
    // выбрана — панель со свойствами, название меняется
    await page.locator(".lm__inspector input").first().fill("Проходная");
    expect((await zones())[0].name).toBe("Проходная");
    // ключ области меняется вручную
    await page.locator(".lm__inspector .key-field__input").fill("zone_gate");
    await page.keyboard.press("Enter");
    expect((await zones())[0].id).toBe("zone_gate");
    // стереть одну клетку (Alt)
    await page.keyboard.down("Alt");
    await page.mouse.click(cell(7, 5).x, cell(7, 5).y);
    await page.keyboard.up("Alt");
    z = await zones();
    expect(z[0].cells).toHaveLength(2);
    await page.close();
  });

  it("конструктор: триггер диалога — область, которую можно создать прямо из диалога", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/dialogues`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    const draft = () => page.evaluate(() => (window as any).__editor.editorStore.get().draft);
    const dialogueId = await page.locator(".ed__list .ed__item[aria-current] code").innerText();
    await page.locator(".dg__trigger .sel").first().click();
    await page.locator('[role="option"]', { hasText: "Область на карте" }).click(); // зон ещё нет — сразу открывается создание
    await page.locator('input[placeholder^="Например"]').fill("У окна");
    expect(await page.getByRole("button", { name: "Создать", exact: true }).isDisabled()).toBe(true); // нет клеток
    const canvas = page.locator(".cell-picker__canvas");
    const box = (await canvas.boundingBox())!;
    const dims = await page.evaluate(() => { const l = (window as any).__editor.editorStore.get().draft.locations[0]; return { w: l.tiles[0].length, h: l.tiles.length }; });
    const at = (x: number, y: number) => ({ x: box.x + (box.width / dims.w) * (x + 0.5), y: box.y + (box.height / dims.h) * (y + 0.5) });
    await page.mouse.move(at(10, 5).x, at(10, 5).y);
    await page.mouse.down();
    await page.mouse.move(at(12, 5).x, at(12, 5).y, { steps: 4 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Создать", exact: true }).click();
    const d = await draft();
    const zone = d.locations[0].zones[0];
    expect(zone).toMatchObject({ name: "У окна" });
    expect(zone.cells.length).toBe(3);
    expect(d.dialogues.find((x: any) => x.id === dialogueId).trigger).toEqual({ kind: "zone", zoneId: zone.id });
    // автозапуск
    await page.getByLabel(/Запускать сам/).check();
    expect((await draft()).dialogues.find((x: any) => x.id === dialogueId).trigger.auto).toBe(true);
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

  it("конструктор: стрелки ходят между разделами и списком, разделы — одна остановка в Tab", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/evidence`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    expect(await page.locator(".ed__nav-item[tabindex='0']").count()).toBe(1);
    const label = () => page.evaluate(() => document.activeElement?.textContent ?? "");
    await page.locator(".ed__list .ed__item[aria-current]").focus();
    await page.keyboard.press("ArrowLeft"); // из списка — к разделам, на текущий
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-current"))).toBe("true");
    const current = await label();
    await page.keyboard.press("ArrowUp"); // по разделам
    expect(await label()).not.toBe(current);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight"); // из разделов — в список
    expect(await page.evaluate(() => document.activeElement?.classList.contains("ed__item"))).toBe(true);
    await page.keyboard.press("ArrowRight"); // из списка — к содержимому раздела
    expect(await page.evaluate(() => !!document.activeElement?.closest(".ed__split > .ed__panel"))).toBe(true);
    await page.keyboard.press("Escape"); // и обратно к выбранному пункту списка
    expect(await page.evaluate(() => document.activeElement?.classList.contains("ed__item"))).toBe(true);
    await page.close();
  });

  it("конструктор: боковые панели локаций и диалогов меняют ширину, сворачиваются и помнят размер", async () => {
    const page = await h.page();
    for (const [path, host] of [["locations", ".lm"], ["dialogues", ".dg"]] as const) {
      await page.goto(`${BASE}/editor/case-001/${path}`);
      await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
      const right = page.locator(`${host} > .panel-grip[data-side="right"]`);
      const width = () => page.evaluate((sel) => document.querySelector<HTMLElement>(sel)!.style.getPropertyValue("--col-right"), host);
      await right.focus();
      const before = parseInt(await width() || "0") || (await page.evaluate((sel) => parseInt(getComputedStyle(document.querySelector(sel)!).gridTemplateColumns.split(" ").at(-1)!), host));
      await page.keyboard.press("ArrowLeft"); // к основному блоку — шире
      await expect.poll(async () => parseInt(await width())).toBeGreaterThan(before);
      // мышью: потянуть границу влево
      const grown = parseInt(await width());
      const box = (await right.boundingBox())!;
      await page.mouse.move(box.x + 2, box.y + 40);
      await page.mouse.down();
      await page.mouse.move(box.x - 58, box.y + 40, { steps: 5 });
      await page.mouse.up();
      await expect.poll(async () => parseInt(await width())).toBeGreaterThan(grown + 40);
      // свернуть и развернуть
      await right.focus();
      await page.keyboard.press("Enter");
      await page.locator(`${host} > .panel-rail[data-side="right"]`).waitFor();
      await page.reload();
      await page.locator(`${host} > .panel-rail[data-side="right"]`).waitFor(); // свёрнутость помнится
      await page.locator(`${host} > .panel-rail[data-side="right"]`).click();
      await right.waitFor();
      expect(parseInt(await width())).toBeGreaterThan(before); // и ширина тоже
    }
    await page.close();
  });

  it("конструктор: порядок локаций меняется кнопками, «Сделать стартовой» ставит локацию первой", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/locations`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    const ids = () => page.evaluate(() => (window as any).__editor.editorStore.get().draft.locations.map((l: any) => l.id) as string[]);
    await page.locator(".lm__tabs .tab--add").click(); // в деле одна локация — добавим вторую
    const [first, second] = await ids();
    expect(second).toBeTruthy();
    await page.getByRole("button", { name: "← Влево" }).click();
    expect((await ids()).slice(0, 2)).toEqual([second, first]);
    await page.getByRole("button", { name: "Вправо →" }).click();
    expect((await ids()).slice(0, 2)).toEqual([first, second]);
    await page.getByRole("button", { name: /Сделать стартовой/ }).click();
    expect((await ids())[0]).toBe(second);
    await page.close();
  });

  it("конструктор: палитру локации можно поставить снизу под карту; выбор помнится, панель меняет высоту и сворачивается", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/locations`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    const rect = (sel: string) => page.evaluate((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
    // инструментов «Кисть» и «Прямоугольник» нет: выбор клетки сразу включает кисть, Shift — прямоугольник; пол и стены — одна секция «Клетки»
    expect(await page.locator(".lm__tool").allTextContents()).toEqual(expect.not.arrayContaining([expect.stringMatching(/Кисть|Прямоуг/)]));
    expect(await page.locator(".lm__section-head").allTextContents()).toEqual([expect.stringContaining("Клетки"), expect.stringContaining("Предметы"), expect.stringContaining("Люди")]);
    // слева по умолчанию: палитра левее карты
    expect((await rect(".lm__palette")).x).toBeLessThan((await rect(".lm__main")).x);
    await page.getByRole("button", { name: "Палитра снизу" }).click();
    await page.waitForSelector('.lm[data-dock="bottom"]');
    const [palette, main] = [await rect(".lm__palette"), await rect(".lm__main")];
    expect(palette.y).toBeGreaterThanOrEqual(main.y + main.h - 1); // ниже карты
    expect(palette.w).toBeGreaterThan(400);
    // инструменты — вертикальным списком; свёрнутая секция сужается до полосы, а не занимает прежнюю ширину
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".lm__tools")!).gridTemplateColumns.split(" ").length)).toBe(1);
    const sectionWidth = () => page.evaluate(() => document.querySelector<HTMLElement>(".lm__palette .lm__section")!.getBoundingClientRect().width);
    const full = await sectionWidth();
    await page.locator(".lm__section-head").first().click();
    expect(await sectionWidth()).toBeLessThan(full / 3);
    // название свёрнутой секции повёрнуто вдоль: выше, чем шире, и стрелка остаётся сверху
    const title = await page.evaluate(() => { const r = document.querySelector(".lm__palette .lm__section:not([data-open]) .lm__section-title")!.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    expect(title.h).toBeGreaterThan(title.w);
    await page.locator(".lm__section-head").first().click();
    expect(await sectionWidth()).toBeGreaterThan(full / 2);
    // высота: стрелка вверх у границы делает панель выше
    const grip = page.locator('.lm > .panel-grip[data-side="bottom"]');
    await grip.focus();
    await page.keyboard.press("ArrowUp");
    await expect.poll(async () => (await rect(".lm__palette")).h).toBeGreaterThan(palette.h);
    // выбор переживает перезагрузку
    await page.reload();
    await page.waitForSelector('.lm[data-dock="bottom"]');
    // свернуть: остаётся полоса
    await page.locator('.lm > .panel-grip[data-side="bottom"]').focus();
    await page.keyboard.press("Enter");
    await page.locator('.lm > .panel-rail[data-side="bottom"]').waitFor();
    await page.getByRole("button", { name: "Палитра слева" }).click();
    await page.waitForSelector('.lm[data-dock="left"]');
    await page.close();
  });

  it("конструктор: эффект «персонаж идёт на клетку» — выбор клетки на карте", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/deductions`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    await page.locator(".fx .sel--add").first().click(); // «+ эффект» (а не «+ условие»)
    await page.locator('[role="option"]', { hasText: "идёт на клетку" }).click();
    await page.getByRole("button", { name: /Выбрать клетку на карте/ }).click();
    const canvas = page.locator(".cell-picker__canvas");
    await canvas.waitFor();
    // стена не выбирается, свободный пол — выбирается: старт игрока всегда свободен
    const start = await page.evaluate(() => (window as any).__editor.editorStore.get().draft.locations[0].playerStart as { x: number; y: number });
    const box = (await canvas.boundingBox())!;
    const tile = box.width / (await page.evaluate(() => (window as any).__editor.editorStore.get().draft.locations[0].tiles[0].length));
    await page.mouse.click(box.x + tile * 0.5, box.y + tile * 0.5); // клетка 0,0 — стена
    expect(await page.getByRole("button", { name: "Выбрать", exact: true }).isDisabled()).toBe(true);
    await page.mouse.click(box.x + tile * (start.x + 0.5), box.y + tile * (start.y + 0.5));
    await page.getByRole("button", { name: "Выбрать", exact: true }).click();
    const effect = await page.evaluate(() =>
      (window as any).__editor.editorStore.get().draft.deductions.flatMap((d: any) => d.effects).find((e: any) => e.type === "moveTo"),
    );
    expect(effect).toMatchObject({ type: "moveTo", x: start.x, y: start.y });
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
