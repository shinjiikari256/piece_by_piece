/* eslint-disable @typescript-eslint/no-explicit-any -- код внутри page.evaluate работает с window.__game */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, start, startCase, type Harness } from "./harness";

const SECTIONS = ["general", "characters", "locations", "evidence", "events", "dialogues", "deductions", "hints", "questions", "solution", "law", "flags", "json", "errors"];

let h: Harness;
beforeAll(async () => {
  h = await start();
});
afterAll(() => h.stop());

describe("игра в браузере: конструктор", () => {
  it("конструктор: инструмент «Область» создаёт именованную область, дорисовывает и стирает клетки", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/locations`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    await page.locator(".lm__tool", { hasText: "Область" }).click();
    const canvas = page.locator(".lm__canvas");
    const box = (await canvas.boundingBox())!;
    const dims = await page.evaluate(() => {
      const l = (window as any).__editor.editorStore.get().draft.locations[0];
      return { w: l.tiles[0].length, h: l.tiles.length };
    });
    const cell = (x: number, y: number) => ({ x: box.x + (box.width / dims.w) * (x + 0.5), y: box.y + (box.height / dims.h) * (y + 0.5) });
    const zones = () => page.evaluate(() => (window as any).__editor.editorStore.get().draft.locations[0].zones as { id: string; name: string; color?: string; cells: { x: number; y: number }[] }[]);
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
    // цвет области: образец из ряда задаёт `color`, первый образец возвращает «по ключу»
    await page.locator(".zone-swatch").nth(3).click();
    expect((await zones())[0]).toMatchObject({ color: expect.stringMatching(/^#[0-9a-f]{6}$/i) });
    await page.locator(".zone-swatch--auto").click();
    expect((await zones())[0].color).toBeUndefined();
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

  it("конструктор: диалог запускается областью — привязать можно и создав область прямо из диалога", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/dialogues`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    const draft = () => page.evaluate(() => (window as any).__editor.editorStore.get().draft);
    const dialogueId = await page.locator(".ed__list .ed__item[aria-current] code").innerText();
    await page.locator(".dg__trigger .sel--add").click();
    await page.locator('[role="option"]', { hasText: "новая область" }).click();
    await page.locator('input[placeholder^="Например"]').fill("У окна");
    expect(await page.getByRole("button", { name: "Создать", exact: true }).isDisabled()).toBe(true); // нет клеток
    const canvas = page.locator(".cell-picker__canvas");
    const box = (await canvas.boundingBox())!;
    const dims = await page.evaluate(() => {
      const l = (window as any).__editor.editorStore.get().draft.locations[0];
      return { w: l.tiles[0].length, h: l.tiles.length };
    });
    const at = (x: number, y: number) => ({ x: box.x + (box.width / dims.w) * (x + 0.5), y: box.y + (box.height / dims.h) * (y + 0.5) });
    await page.mouse.move(at(10, 5).x, at(10, 5).y);
    await page.mouse.down();
    await page.mouse.move(at(12, 5).x, at(12, 5).y, { steps: 4 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Создать", exact: true }).click();
    const zone = (await draft()).locations[0].zones[0];
    expect(zone).toMatchObject({ name: "У окна" });
    expect(zone.cells.length).toBe(3);
    expect(zone.actions).toEqual([{ kind: "dialogue", dialogueId }]); // действие лежит в самой области
    // отвязка не удаляет область
    await page.getByRole("button", { name: "Отвязать область" }).click();
    const after = (await draft()).locations[0].zones[0];
    expect(after.actions).toEqual([]);
    await page.close();
  });

  it("конструктор: действия области — добавить «Выход», порядок, автозапуск", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/locations`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    await page.locator(".lm__tool", { hasText: "Область" }).click();
    const canvas = page.locator(".lm__canvas");
    const box = (await canvas.boundingBox())!;
    const dims = await page.evaluate(() => {
      const l = (window as any).__editor.editorStore.get().draft.locations[0];
      return { w: l.tiles[0].length, h: l.tiles.length };
    });
    const at = (x: number, y: number) => ({ x: box.x + (box.width / dims.w) * (x + 0.5), y: box.y + (box.height / dims.h) * (y + 0.5) });
    await page.mouse.click(at(5, 5).x, at(5, 5).y);
    await page.locator(".zact .sel--add").click();
    await page.locator('[role="option"]', { hasText: "Выход" }).click();
    await page.locator(".zact .sel", { hasText: "по клавише взаимодействия" }).click();
    await page.locator('[role="option"]', { hasText: "при входе (один раз)" }).click();
    const zone = await page.evaluate(() => (window as any).__editor.editorStore.get().draft.locations[0].zones[0]);
    expect(zone.actions).toHaveLength(1);
    expect(zone.actions[0]).toMatchObject({ kind: "exit", trigger: "enter" });
    await page.close();
  });

  it("инспектор карты: координаты x и y — в одной строке", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/locations`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    await page.locator(".lm__itabs .tab", { hasText: "Объекты" }).click();
    await page.locator(".lm__row").first().click();
    const boxes = await page.locator(".lm__inspector .pair--xy input").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBe(boxes[1]);
    // и растягиваются поровну
    const widths = await page.locator(".lm__inspector .pair--xy input").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
    expect(widths[0]).toBeGreaterThan(80);
    await page.close();
  });

  it("конструктор: у человека на карте — диалоги по условию (очная ставка как обычный диалог)", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/locations`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    await page.locator(".lm__itabs .tab", { hasText: "Объекты" }).click();
    await page.locator(".lm__row", { hasText: "npc_" }).first().click();
    await page.locator(".zact .sel--add").click();
    await page.locator('[role="option"]').first().click();
    const npcs = await page.evaluate(() => (window as any).__editor.editorStore.get().draft.locations[0].npcs as { dialogues: unknown[] }[]);
    expect(npcs.some((n) => n.dialogues.length === 1)).toBe(true);
    await page.close();
  });

  it("конструктор: в списке диалогов видно, кто их запускает; неподключённый помечен", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/dialogues`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    // готовые диалоги дела подключены к людям на карте
    expect(await page.locator(".ed__item-note", { hasText: "☺" }).count()).toBeGreaterThan(0);
    await page.locator(".ed__list-add").click(); // новый диалог никто не запускает
    await expect.poll(() => page.locator(".ed__item-note", { hasText: "не подключён" }).count()).toBe(1);
    // и в проверке дела появилось предупреждение (не ошибка)
    await expect.poll(() => page.locator(".ed__nav-item--warnings").count()).toBe(1);
    expect(await page.locator(".ed__nav-item--errors").count()).toBe(0);
    // привязка к новой области на месте снимает пометку
    await page.locator(".dg__trigger .sel--add").click();
    await page.locator('[role="option"]', { hasText: "новая область" }).click();
    await page.locator('input[placeholder^="Например"]').fill("Проход");
    const canvas = page.locator(".cell-picker__canvas");
    const box = (await canvas.boundingBox())!;
    const dims = await page.evaluate(() => {
      const l = (window as any).__editor.editorStore.get().draft.locations[0];
      return { w: l.tiles[0].length, h: l.tiles.length };
    });
    await page.mouse.click(box.x + (box.width / dims.w) * 10.5, box.y + (box.height / dims.h) * 5.5);
    await page.getByRole("button", { name: "Создать", exact: true }).click();
    await expect.poll(() => page.locator(".ed__item-note", { hasText: "не подключён" }).count()).toBe(0);
    expect(await page.locator(".ed__item-note", { hasText: "▦ Проход" }).count()).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).__editor.editorStore.get().warnings.filter((w: string) => w.includes("никто не запускает")).length)).toBe(0); // предупреждение про диалог ушло (другие, например про год событий, остаются)
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
    await page.locator(".eh__case", { hasText: "Чужие письма" }).getByRole("button", { name: "Редактировать" }).click();
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
    for (const [path, host] of [
      ["locations", ".lm"],
      ["dialogues", ".dg"],
    ] as const) {
      await page.goto(`${BASE}/editor/case-001/${path}`);
      await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
      const right = page.locator(`${host} > .panel-grip[data-side="right"]`);
      const width = () => page.evaluate((sel) => document.querySelector<HTMLElement>(sel)!.style.getPropertyValue("--col-right"), host);
      await right.focus();
      const before = parseInt((await width()) || "0") || (await page.evaluate((sel) => parseInt(getComputedStyle(document.querySelector(sel)!).gridTemplateColumns.split(" ").at(-1)!), host));
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

  it("конструктор: порядок локаций меняется кнопками на всю ширину; старт один на дело, у новой локации его нет", async () => {
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
    expect(await page.getByRole("button", { name: /Сделать стартовой/ }).count()).toBe(0);
    const widths = await page.locator(".lm__order > .btn").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(Math.abs(widths[0] - widths[1])).toBeLessThan(2);
    const starts = await page.evaluate(() => (window as any).__editor.editorStore.get().draft.locations.filter((l: any) => l.playerStart).length);
    expect(starts).toBe(1);
    await page.close();
  });

  it("конструктор: палитру локации можно поставить снизу под карту; выбор помнится, панель меняет высоту и сворачивается", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/editor/case-001/locations`);
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    const rect = (sel: string) =>
      page.evaluate((s) => {
        const r = document.querySelector(s)!.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }, sel);
    // инструментов «Кисть» и «Прямоугольник» нет: выбор клетки сразу включает кисть, Shift — прямоугольник; пол и стены — одна секция «Клетки»
    expect(await page.locator(".lm__tool").allTextContents()).toEqual(expect.not.arrayContaining([expect.stringMatching(/Кисть|Прямоуг/)]));
    expect(await page.locator(".lm__section-head").allTextContents()).toEqual([expect.stringContaining("Клетки"), expect.stringContaining("Предметы"), expect.stringContaining("Люди")]);
    // поиск по клеткам: «кафель» оставляет одну клетку, ничего не найдено — подсказка
    await page.locator('input[placeholder="Поиск клетки…"]').fill("кафель");
    expect(await page.locator(".lm__swatch").count()).toBe(1);
    await page.locator('input[placeholder="Поиск клетки…"]').fill("zzz");
    expect(await page.locator(".lm__swatch").count()).toBe(0);
    await page.locator('input[placeholder="Поиск клетки…"]').fill("");
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
    const title = await page.evaluate(() => {
      const r = document.querySelector(".lm__palette .lm__section:not([data-open]) .lm__section-title")!.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
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
    const add = page.locator(".fx .sel--add", { hasText: "+ эффект" }).first(); // «+ эффект» (а не «+ условие»)
    await add.evaluate((e) => e.scrollIntoView({ block: "center" })); // выпадающий список закрывается от прокрутки страницы
    await add.click();
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
      (window as any).__editor.editorStore
        .get()
        .draft.deductions.flatMap((d: any) => d.effects)
        .find((e: any) => e.type === "moveTo"),
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
    await page.locator(".eh__case", { hasText: "Чужие письма" }).getByRole("button", { name: "Редактировать" }).click();
    await page.getByRole("button", { name: "Запустить" }).first().click();
    await page.waitForFunction(() => (window as any).__game?.store.get().caseFile?.id === "case-001");
    // без вступления и без вопроса о прошлом сохранении
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play");
    expect(await page.evaluate(() => !!document.querySelector(".playtest-banner"))).toBe(true);
    expect(await page.getByRole("button", { name: "Начать заново" }).count()).toBe(0);
    expect(new URL(page.url()).pathname).toBe("/playtest");
    // в шапке вместо «в главное меню» — стрелка назад в конструктор; сначала спрашивает про выход
    await page.locator("a.topbar__home").click();
    await page.getByRole("button", { name: "Сохранить и вернуться" }).click();
    await expect.poll(() => page.evaluate(() => location.pathname)).toBe("/editor/case-001/general");
    // открыт конструктор дела, а не список дел; плашки тестового запуска там нет
    await page.waitForFunction(() => (window as any).__editor?.editorStore.get().screen === "case");
    expect(await page.evaluate(() => !!document.querySelector(".playtest-banner"))).toBe(false);
    await page.close();
  });
});
