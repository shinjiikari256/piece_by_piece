import { describe, expect, it } from "vitest";
import type { CaseFile, CustomSprite } from "../../../../../shared/case";
import { cellSolid, conditionOf, newSprite, renameSprite, rulesOf, spriteUses, toggleCell, withAlpha } from "./helpers";

const sprite = (over: Partial<CustomSprite> = {}): CustomSprite => ({ key: "a", name: "A", w: 16, h: 16, footprint: { w: 2, h: 1 }, solid: true, frames: { default: [] }, ...over });
const draft = (): CaseFile =>
  ({
    sprites: [sprite()],
    locations: [
      {
        id: "l",
        objects: [
          { id: "o", sprite: "a" },
          { id: "p", sprite: "table" },
        ],
      },
    ],
  }) as unknown as CaseFile;

describe("helpers спрайтов", () => {
  it("прозрачность в цвете", () => {
    expect(withAlpha("#112233", 255)).toBe("#112233");
    expect(withAlpha("#112233", 128)).toBe("#11223380");
  });
  it("клетки опоры: исключение хранится, только если отличается", () => {
    const s = sprite();
    expect(cellSolid(s, 1, 0)).toBe(true);
    const cells = toggleCell(s, 1, 0);
    expect(cells).toEqual([{ dx: 1, dy: 0, solid: false }]);
    expect(cellSolid({ ...s, cells }, 1, 0)).toBe(false);
    expect(toggleCell({ ...s, cells }, 1, 0)).toEqual([]);
  });
  it("правила ↔ условие", () => {
    const params = [
      { id: "f", name: "F", kind: "flag" as const },
      { id: "c", name: "C", kind: "counter" as const },
      { id: "e", name: "E", kind: "enum" as const, values: [{ id: "x", name: "X" }] },
    ];
    const cond = conditionOf(undefined, { f: { flag: false }, c: { min: 2 }, e: { values: ["x"] } }, params);
    expect(cond).toEqual({ notFlags: ["f"], counters: [{ counterId: "c", min: 2 }], enums: [{ enumId: "e", in: ["x"] }] });
    expect(rulesOf(cond)).toEqual({ f: { flag: false }, c: { min: 2, max: undefined }, e: { values: ["x"] } });
    expect(conditionOf(undefined, {}, params)).toBeUndefined();
  });
  it("новый спрайт не повторяет ключи", () => {
    expect(newSprite(draft(), (k) => k === "sprite_2").key).toBe("sprite_3");
  });
  it("использование и переименование", () => {
    expect(spriteUses(draft(), "a")).toEqual(["l/o"]);
    const r = renameSprite(draft(), "a", "b");
    expect(r.sprites?.[0].key).toBe("b");
    expect(spriteUses(r, "b")).toEqual(["l/o"]);
  });
});
