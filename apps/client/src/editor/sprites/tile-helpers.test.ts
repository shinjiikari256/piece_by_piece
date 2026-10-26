import { describe, expect, it } from "vitest";
import { eraseCell, type TileOp } from "./tile-helpers";

/** Закрашенные пиксели набора прямоугольников. */
const pixels = (ops: TileOp[]) => {
  const out = new Set<string>();
  for (const o of ops) if (Array.isArray(o)) for (let x = o[0]; x < o[0] + o[2]; x++) for (let y = o[1]; y < o[1] + o[3]; y++) out.add(`${x},${y}`);
  return out;
};

describe("ластик тайла", () => {
  it("стирает один пиксель, остальное остаётся", () => {
    const ops: TileOp[] = [[0, 0, 4, 4, "#ff0000"]];
    const next = eraseCell(ops, 1, 2);
    const left = pixels(next);
    expect(left.size).toBe(15);
    expect(left.has("1,2")).toBe(false);
    expect(next.every((o) => Array.isArray(o) && o[4] === "#ff0000")).toBe(true);
  });

  it("мимо — ничего не меняется; угол и край не дают пустых частей", () => {
    const ops: TileOp[] = [[2, 2, 2, 2, "#00ff00"]];
    expect(eraseCell(ops, 0, 0)[0]).toBe(ops[0]);
    const corner = eraseCell(ops, 2, 2);
    expect(pixels(corner).size).toBe(3);
    expect(corner.every((o) => Array.isArray(o) && o[2] > 0 && o[3] > 0)).toBe(true);
  });
});
