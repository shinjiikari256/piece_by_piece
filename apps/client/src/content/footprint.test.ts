import { afterEach, describe, expect, it } from "vitest";
import type { Location } from "../../../../shared/case";
import { SPRITES } from "../game/art";
import { cellFree } from "./case-utils";

const original = SPRITES.desk.footprint;
afterEach(() => {
  SPRITES.desk.footprint = original;
});

const loc = (): Location =>
  ({
    id: "l",
    tiles: Array.from({ length: 6 }, () => "......"),
    objects: [{ id: "d", sprite: "desk", x: 1, y: 3, label: "", interaction: null, onInteract: [] }],
    npcs: [],
  }) as unknown as Location;

describe("двумерная опора и свободные клетки", () => {
  it("опора 2×1 занимает только свой ряд", () => {
    expect(cellFree(loc(), 1, 3)).toBe(false);
    expect(cellFree(loc(), 2, 3)).toBe(false);
    expect(cellFree(loc(), 3, 3)).toBe(true);
    expect(cellFree(loc(), 1, 2)).toBe(true);
  });

  it("опора 2×2 занимает ряды вверх от точки предмета, но не ниже", () => {
    SPRITES.desk.footprint = { w: 2, h: 2 };
    expect(cellFree(loc(), 1, 2)).toBe(false);
    expect(cellFree(loc(), 2, 2)).toBe(false);
    expect(cellFree(loc(), 1, 1)).toBe(true);
    expect(cellFree(loc(), 1, 4)).toBe(true);
  });
});
