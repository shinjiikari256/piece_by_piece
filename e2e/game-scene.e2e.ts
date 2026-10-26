/* eslint-disable @typescript-eslint/no-explicit-any -- код внутри page.evaluate работает с window.__game */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, start, type Harness } from "./harness";

let h: Harness;
beforeAll(async () => {
  h = await start();
});
afterAll(() => h.stop());

describe("игра в браузере: сцена, области и перемещения", () => {
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
    const state = () =>
      page.evaluate(() => {
        const scene = (window as any).__scene;
        const n = scene.crowd.npcs.get("timur");
        const item = scene.interactables.find((i: any) => i.id === "npc_timur");
        return {
          mode: n.mode,
          tile: [n.tile.x, n.tile.y],
          x: n.x,
          y: n.y,
          item: [item.x, item.y],
          label: n.labelText.x,
          sprite: n.sprite.x,
          place: (window as any).__game.store.get().progress.npcPlaces.timur,
        };
      });
    // в пути: идёт (не телепорт), итоговое место в состоянии уже записано
    await page.waitForTimeout(600);
    const walking = await state();
    expect(walking.mode).toBe("walker");
    expect(walking.tile).not.toEqual([22, 14]);
    expect(walking.place).toMatchObject({ x: 22, y: 14 });
    // пришёл
    await page.waitForFunction(() => (window as any).__scene.crowd.npcs.get("timur").mode === "static", null, { timeout: 25_000 });
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
    const vika = await page.evaluate(() => ({ mode: (window as any).__scene.crowd.npcs.get("vika").mode, place: (window as any).__game.store.get().progress.npcPlaces.vika ?? null }));
    expect(vika).toEqual({ mode: "static", place: null });
    await page.close();
  });

  it("moveTo: после перезагрузки персонаж сразу стоит на новом месте", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/play/case-test-moveto`);
    await page.getByRole("button", { name: /Приступить к расследованию/ }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play" && (window as any).__scene);
    await page.evaluate(() => {
      (window as any).__scene.timeScale = 3; // ходьба нужна как условие, не как предмет проверки
      const { actions } = (window as any).__game;
      actions.interact("npc_timur");
      actions.choose("t_menu");
      actions.choose("t1"); // Тимур идёт в клетку 22,14
      actions.close();
    });
    await page.waitForFunction(() => (window as any).__scene.crowd.npcs.get("timur").mode === "static", null, { timeout: 25_000 });
    await page.waitForTimeout(600); // автосохранение
    await page.reload();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play" && (window as any).__scene?.crowd?.npcs.get("timur"));
    const after = await page.evaluate(() => {
      const n = (window as any).__scene.crowd.npcs.get("timur");
      return { mode: n.mode, tile: [n.tile.x, n.tile.y], place: (window as any).__game.store.get().progress.npcPlaces.timur };
    });
    expect(after.mode).toBe("static"); // не идёт заново, а стоит
    expect(after.tile).toEqual([22, 14]);
    expect(after.place).toMatchObject({ x: 22, y: 14 });
    await page.close();
  });

  it("выход — область с действием exit: внутри неё подсказка, E переводит в другую локацию; стрелок и постоянных подписей нет", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/play/case-test-moveto`);
    await page.getByRole("button", { name: /Приступить к расследованию/ }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play" && (window as any).__scene);
    const info = await page.evaluate(() => {
      const scene = (window as any).__scene;
      const zones = scene.interactables.filter((i: any) => i.zone);
      return {
        exits: scene.location.zones.filter((z: any) => z.actions.some((a: any) => a.kind === "exit")).length,
        hidden: zones.every((i: any) => !i.labelText.visible),
        legacy: (scene.location.exits ?? null) === null && scene.textures.exists("exit_left") === false,
      };
    });
    expect(info.exits).toBe(2); // лестница вниз — две области
    expect(info.hidden).toBe(true);
    expect(info.legacy).toBe(true);
    // встаём в область лестницы — подсказка; E (interact) переводит в холл в точку появления
    const cell = await page.evaluate(() => (window as any).__scene.location.zones.find((z: any) => z.id === "stairs_down_a").cells[0] as { x: number; y: number });
    await page.evaluate(([x, y]) => (window as any).__scene.player.setPosition((x + 0.5) * 32, (y + 1) * 32 - 2), [cell.x, cell.y]);
    await page.waitForFunction(() => (window as any).__scene.focused?.id === "zone:stairs_down_a");
    await page.evaluate(() => (window as any).__game.actions.interact("zone:stairs_down_a"));
    expect(await page.evaluate(() => (window as any).__game.store.get().locationId)).toBe("dorm_lobby");
    await page.close();
  });

  it("клик по области-выходу: игрок идёт в неё и переходит в другую локацию", async () => {
    const page = await h.page();
    await page.goto(`${BASE}/play/case-test-moveto`);
    await page.getByRole("button", { name: /Приступить к расследованию/ }).click();
    await page.waitForFunction(() => (window as any).__game.store.get().screen === "play" && (window as any).__scene);
    await page.evaluate(() => {
      const scene = (window as any).__scene;
      scene.timeScale = 3;
      const cell = scene.location.zones.find((z: any) => z.id === "stairs_down_a").cells[0] as { x: number; y: number };
      // наведение на выход показывает подпись и курсор-«руку», уход убирает
      const at = { worldX: (cell.x + 0.5) * 32, worldY: (cell.y + 0.5) * 32 };
      const label = scene.interactables.find((i: any) => i.zone?.id === "stairs_down_a").labelText;
      scene.input.emit("pointermove", at, []);
      if (!label.visible || scene.input.manager.canvas.style.cursor !== "pointer") throw new Error("нет подсказки при наведении на выход");
      scene.input.emit("pointermove", { worldX: 0, worldY: 0 }, []);
      if (label.visible) throw new Error("подпись выхода не пропала");
      // тот же путь, что у настоящего клика по пустому месту карты (поле — в мировых координатах)
      scene.input.emit("pointerdown", { worldX: (cell.x + 0.5) * 32, worldY: (cell.y + 0.5) * 32 }, []);
    });
    await page.waitForFunction(() => (window as any).__game.store.get().locationId === "dorm_lobby", undefined, { timeout: 45000 });
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
    const placeAt = (x: number, y: number) => page.evaluate(([tx, ty]) => (window as any).__scene.player.setPosition((tx + 0.5) * 32, (ty + 1) * 32 - 2), [x, y]);
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
    // область с действием «эффекты» и автозапуском сама ставит флаг
    await placeAt(2, 14);
    await page.waitForFunction(() => (window as any).__game.store.get().progress.flags.includes("visited_corner"));
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
});
