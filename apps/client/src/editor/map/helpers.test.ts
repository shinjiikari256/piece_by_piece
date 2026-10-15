import { describe, expect, it } from "vitest";
import type { Location } from "../../../../../shared/case";
import { T } from "./canvases";
import { objectRect, pickTopmost, selectionBox } from "./helpers";

const loc = (objects: Location["objects"]): Location => ({
  id: "l",
  name: "L",
  tiles: Array.from({ length: 10 }, () => ".".repeat(12)),
  areas: [],
  playerStart: { x: 1, y: 1 },
  objects,
  npcs: [],
  exits: [],
  doors: [],
  zones: [],
});
const obj = (id: string, sprite: Location["objects"][number]["sprite"], x: number, y: number) => ({ id, sprite, x, y, label: "", interaction: null });

describe("выбор на карте редактора", () => {
  it("высокий предмет выбирается за любую точку картинки, а не только за клетку под ногами", () => {
    const l = loc([obj("cab", "cabinet", 2, 3)]); // шкаф 16×30: выше своей клетки
    const r = objectRect(l.objects[0]);
    expect(r.h).toBeGreaterThan(T); // картинка выше одной клетки
    const aboveAnchor = { x: r.x + 4, y: r.y + 3 }; // верх шкафа — клеткой выше
    expect(Math.floor(aboveAnchor.y / T)).toBeLessThan(3);
    expect(pickTopmost(l, aboveAnchor.x, aboveAnchor.y)).toEqual({ kind: "object", id: "cab" });
    expect(pickTopmost(l, r.x - 3, r.y + 3)).toBeNull(); // мимо картинки
  });

  it("из перекрывающихся выбирается тот, что нарисован выше всех", () => {
    // стол (48..80 × 42..64) и стул «b» (48..64 × 48..64) на одной линии пола; стул «c» — клеткой ниже
    const l = loc([obj("a", "desk", 3, 3), obj("b", "chair", 3, 3), obj("c", "chair", 3, 4)]);
    expect(pickTopmost(l, 56, 62)).toEqual({ kind: "object", id: "b" }); // стол и стул «b»: позже в списке — выше
    expect(pickTopmost(l, 72, 50)).toEqual({ kind: "object", id: "a" }); // только стол
    expect(pickTopmost(l, 56, 72)).toEqual({ kind: "object", id: "c" }); // ниже по карте — ближе к зрителю
  });

  it("прозрачные углы не в счёт, если задана проверка пикселя", () => {
    const l = loc([obj("cab", "cabinet", 2, 3)]);
    const r = objectRect(l.objects[0]);
    expect(pickTopmost(l, r.x + 1, r.y + 1, () => false)).toBeNull();
    expect(pickTopmost(l, r.x + 1, r.y + 1, () => true)).toEqual({ kind: "object", id: "cab" });
  });

  it("рамка выделения — вся картинка предмета", () => {
    const l = loc([obj("cab", "cabinet", 2, 3)]);
    expect(selectionBox(l, { kind: "object", id: "cab" })).toEqual(objectRect(l.objects[0]));
    expect(selectionBox(l, { kind: "start" })).toEqual({ x: T, y: T, w: T, h: T });
    expect(selectionBox(l, null)).toBeNull();
  });
});
