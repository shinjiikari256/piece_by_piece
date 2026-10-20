import { describe, expect, it } from "vitest";
import { SpriteKey } from "../../../../../../shared/case";
import { footprintCells, footprintHas } from "./cells";
import { SPRITES } from "./index";

describe("опора предмета", () => {
  it("ширина идёт вправо, высота — вверх от точки предмета", () => {
    const cells = footprintCells(3, 5, { w: 2, h: 2 });
    expect(cells).toHaveLength(4);
    expect(cells).toEqual(expect.arrayContaining([{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 4 }, { x: 4, y: 4 }]));
  });

  it("опора 1×1 — одна клетка", () => {
    expect(footprintCells(0, 0, { w: 1, h: 1 })).toEqual([{ x: 0, y: 0 }]);
  });

  it("footprintHas совпадает с footprintCells и не захватывает соседние клетки", () => {
    const fp = { w: 3, h: 2 };
    const cells = footprintCells(2, 4, fp);
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 8; y++) expect(footprintHas(2, 4, fp, x, y), `${x},${y}`).toBe(cells.some((c) => c.x === x && c.y === y));
  });

  it.each(SpriteKey.options)("%s: опора — целые положительные размеры", (key) => {
    const { w, h } = SPRITES[key].footprint;
    expect(Number.isInteger(w) && w >= 1).toBe(true);
    expect(Number.isInteger(h) && h >= 1).toBe(true);
  });
});
