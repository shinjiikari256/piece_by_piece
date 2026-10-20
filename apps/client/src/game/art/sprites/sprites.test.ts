import { describe, expect, it } from "vitest";
import { SpriteKey } from "../../../../../../shared/case";
import { SPRITE_NAMES } from "../tiles";
import { SPRITES, SPRITE_GROUPS } from "./index";

/** Прогнать `draw` по записывающему холсту: список прямоугольников. */
function record(draw: (ctx: never) => void) {
  const rects: { x: number; y: number; w: number; h: number; color: string }[] = [];
  let color = "";
  const ctx = {
    set fillStyle(v: string) {
      color = v;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, color });
    },
  };
  draw(ctx as never);
  return rects;
}

describe("спрайты предметов", () => {
  it("каждый ключ схемы дела описан ровно в одной группе и имеет русское название", () => {
    const inGroups = SPRITE_GROUPS.flatMap((g) => Object.keys(g.sprites));
    expect(new Set(inGroups).size).toBe(inGroups.length); // нет дублей между группами
    expect([...inGroups].sort()).toEqual([...SpriteKey.options].sort());
    for (const k of SpriteKey.options) expect(SPRITE_NAMES[k], k).toBeTruthy();
  });

  it("группы подписаны и не пусты", () => {
    for (const g of SPRITE_GROUPS) {
      expect(g.label).toBeTruthy();
      expect(Object.keys(g.sprites).length, g.id).toBeGreaterThan(0);
    }
  });

  it.each(SpriteKey.options)("%s: рисунок не выходит за размер спрайта и не пуст", (key) => {
    const spec = SPRITES[key];
    const rects = record(spec.draw as never);
    expect(rects.length).toBeGreaterThan(0);
    for (const r of rects) {
      expect(r.x, `${key} x`).toBeGreaterThanOrEqual(0);
      expect(r.y, `${key} y`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, `${key} правый край`).toBeLessThanOrEqual(spec.w);
      expect(r.y + r.h, `${key} низ`).toBeLessThanOrEqual(spec.h);
    }
    expect(spec.footprint.w).toBeGreaterThanOrEqual(1);
    expect(spec.footprint.h).toBeGreaterThanOrEqual(1);
    expect(spec.w).toBeLessThanOrEqual(spec.footprint.w * 16 + 16); // картинка не шире занимаемых клеток более чем на клетку
  });
});
