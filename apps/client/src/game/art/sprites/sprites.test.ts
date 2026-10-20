import { describe, expect, it } from "vitest";
import { SpriteKey } from "../../../../../../shared/case";
import { SPRITE_NAMES } from "../tiles";
import { SPRITES, SPRITE_GROUPS, SPRITE_COLOR, drawSprite } from "./index";

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
    clearRect() {},
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

  it("обязательный набор заготовок на месте: следы преступления, столы, мелкие предметы", () => {
    const required = [
      "blood_pool", "blood_splatter", "blood_drops", "body_floor", "body_wall", "body_covered", "chalk_outline", "evidence_tag",
      "desk", "computer_desk", "desk_papers", "desk_corner", "conference_table_3", "conference_table_4", "coffee_table", "dining_table", "kitchen_table",
      "bar_counter", "judge_bench", "school_desk", "lab_table", "nightstand", "operating_table",
      "door_h", "door_v", "safe", "cabinet", "crate", "documents", "folder", "key", "flashlight",
    ];
    for (const k of required) expect(SPRITES[k], k).toBeTruthy();
    for (const k of ["blood_pool", "blood_splatter", "blood_drops", "body_floor", "body_wall", "body_covered", "chalk_outline"]) {
      expect(SPRITES[k].flat, `${k} плоский`).toBe(true);
      expect(SPRITES[k].solid, `${k} проходим`).toBe(false);
    }
    expect(SPRITES.conference_table_3.footprint.w).toBe(3);
    expect(SPRITES.conference_table_4.footprint.w).toBe(4);
  });

  it("группы подписаны и не пусты", () => {
    for (const g of SPRITE_GROUPS) {
      expect(g.label).toBeTruthy();
      expect(Object.keys(g.sprites).length, g.id).toBeGreaterThan(0);
    }
  });

  it.each(SpriteKey.options)("%s: рисунок не выходит за размер спрайта и не пуст", (key) => {
    const spec = SPRITES[key];
    const rects = record((ctx) => drawSprite(ctx as never, spec));
    expect(rects.length).toBeGreaterThan(0);
    for (const r of rects) {
      expect(r.x, `${key} x`).toBeGreaterThanOrEqual(0);
      expect(r.y, `${key} y`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, `${key} правый край`).toBeLessThanOrEqual(spec.w);
      expect(r.y + r.h, `${key} низ`).toBeLessThanOrEqual(spec.h);
    }
    expect(Array.isArray(spec.frames.default), `${key} кадр default`).toBe(true);
    for (const [frame, ops] of Object.entries(spec.frames)) {
      for (const op of ops) {
        expect([4, 5], `${key}/${frame}`).toContain(op.length);
        expect(op.slice(0, 4).every((n) => Number.isInteger(n)), `${key}/${frame} числа`).toBe(true);
        if (op.length === 5) expect(op[4], `${key}/${frame} цвет`).toMatch(SPRITE_COLOR);
      }
    }
    expect(spec.footprint.w).toBeGreaterThanOrEqual(1);
    expect(spec.footprint.h).toBeGreaterThanOrEqual(1);
    expect(spec.w).toBeLessThanOrEqual(spec.footprint.w * 16 + 16); // картинка не шире занимаемых клеток более чем на клетку
  });
});

describe("drawSprite", () => {
  it("заливает с прозрачностью и стирает областью без цвета", () => {
    const calls: string[] = [];
    const ctx = {
      set fillStyle(v: string) {
        calls.push(`fill ${v}`);
      },
      fillRect: (...a: number[]) => calls.push(`rect ${a}`),
      clearRect: (...a: number[]) => calls.push(`clear ${a}`),
    };
    const spec = { w: 4, h: 4, footprint: { w: 1, h: 1 }, solid: false, frames: { default: [[0, 0, 4, 4, "#ff000080"], [1, 1, 2, 2]], open: [[0, 0, 1, 1, "#00ff00"]] } };
    drawSprite(ctx as never, spec as never);
    expect(calls).toEqual(["fill #ff000080", "rect 0,0,4,4", "clear 1,1,2,2"]);
    calls.length = 0;
    drawSprite(ctx as never, spec as never, "open");
    expect(calls).toEqual(["fill #00ff00", "rect 0,0,1,1"]);
  });
});
