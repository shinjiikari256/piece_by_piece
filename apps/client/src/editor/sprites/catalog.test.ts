import { describe, expect, it } from "vitest";
import type { CaseFile, CustomSprite } from "../../../../../shared/case";
import { SPRITE_GROUPS } from "../../game/art";
import { copyOf, groupLabels, isBuiltin, spriteGroups, spriteView } from "./catalog";
import { cellsOf, describeRules, frameLabel, moveFrame, resizeSprite, renameFrame, uniqueKey, withoutParam } from "./helpers";

const mine = (over: Partial<CustomSprite> = {}): CustomSprite => ({
  key: "lamp",
  name: "Лампа",
  w: 16,
  h: 16,
  footprint: { w: 1, h: 1 },
  solid: true,
  frames: { default: [[0, 0, 1, 1, "#ffffff"]], on: [] },
  ...over,
});
const draft = (sprites: CustomSprite[] = [mine()]) => ({ sprites, locations: [{ id: "l", objects: [{ id: "o", sprite: "lamp", states: [{ id: "s", frame: "on" }] }] }] }) as unknown as CaseFile;

describe("каталог спрайтов", () => {
  it("встроенные видны, неизменяемы и копируются", () => {
    const first = Object.keys(SPRITE_GROUPS[0].sprites)[0];
    expect(isBuiltin(first)).toBe(true);
    expect(isBuiltin("lamp")).toBe(false);
    const v = spriteView(draft(), first)!;
    expect(v.name).toBeTruthy();
    const copy = copyOf(draft(), v);
    expect(copy.key).toBe(`${first}_copy`);
    expect(isBuiltin(copy.key)).toBe(false);
    expect(copy.name).toContain("копия");
    expect(copy.frames).toEqual(v.frames);
  });
  it("копия не повторяет ключ", () => {
    const d = draft([mine(), mine({ key: "lamp_copy" })]);
    expect(copyOf(d, mine()).key).toBe("lamp_copy_2");
  });
  it("группы: свои идут в группу с тем же названием или в свою", () => {
    const label = SPRITE_GROUPS[0].label;
    const g = spriteGroups({ sprites: [mine({ group: label }), mine({ key: "b", group: "Лаборатория" }), mine({ key: "c" })] });
    expect(g.find((x) => x.label === label)!.keys).toContain("lamp");
    expect(g.find((x) => x.label === "Лаборатория")!.keys).toEqual(["b"]);
    expect(g.find((x) => x.label === "Свои")!.keys).toEqual(["c"]);
    expect(groupLabels({ sprites: [mine({ group: "Лаборатория" })] })).toContain("Лаборатория");
    expect(g[0].label).toBe("Свои");
    expect(groupLabels({ sprites: [] })[0]).toBe("Свои");
  });
});

describe("размер в клетках и порядок кадров", () => {
  it("размер в клетках округляется вверх", () => {
    expect(cellsOf(16)).toBe(1);
    expect(cellsOf(17)).toBe(2);
    expect(cellsOf(48)).toBe(3);
  });
  it("при изменении размера опора, равная размеру, растёт с ним, иначе обрезается", () => {
    const s = mine({ w: 32, h: 16, footprint: { w: 2, h: 1 }, cells: [{ dx: 1, dy: 0, solid: false }] });
    expect(resizeSprite(s, 3, 1)).toMatchObject({ w: 48, h: 16, footprint: { w: 3, h: 1 } });
    const small = resizeSprite(mine({ w: 48, footprint: { w: 2, h: 1 }, cells: [{ dx: 1, dy: 0, solid: false }] }), 1, 1);
    expect(small).toMatchObject({ w: 16, footprint: { w: 1, h: 1 }, cells: [] });
  });
  it("кадр переезжает на новое место, остальные сохраняют порядок", () => {
    const s = mine({ frames: { default: [], a: [], b: [] } });
    expect(Object.keys(moveFrame(s.frames, "b", "default"))).toEqual(["b", "default", "a"]);
    expect(Object.keys(moveFrame(s.frames, "default", "b"))).toEqual(["a", "b", "default"]);
    expect(Object.keys(moveFrame(s.frames, "a", "a"))).toEqual(["default", "a", "b"]);
  });
});

describe("кадры и переменные", () => {
  it("подписи стандартных кадров", () => {
    expect(frameLabel("default")).toBe("Основной");
    expect(frameLabel("Мой кадр")).toBe("Мой кадр");
  });
  it("свободный ключ", () => {
    expect(uniqueKey("a", (k) => k === "a" || k === "a_2")).toBe("a_3");
  });
  it("переименование кадра обновляет предметы", () => {
    const r = renameFrame(draft(), "lamp", "on", "горит");
    expect(Object.keys(r.sprites![0].frames)).toEqual(["default", "горит"]);
    expect((r.locations[0].objects[0] as unknown as { states: { frame: string }[] }).states[0].frame).toBe("горит");
  });
  it("удаление переменной чистит условия", () => {
    const s = mine({
      params: [
        { id: "f", name: "Горит", kind: "flag" },
        { id: "g", name: "Занят", kind: "flag" },
      ],
      states: [{ id: "x", when: { flags: ["f", "g"] } }],
    });
    const p = withoutParam(s, "f");
    expect(p.params).toEqual([{ id: "g", name: "Занят", kind: "flag" }]);
    expect(p.states![0].when).toEqual({ flags: ["g"] });
  });
  it("условие словами", () => {
    const params = [
      { id: "f", name: "Горит", kind: "flag" as const },
      { id: "c", name: "Заряд", kind: "counter" as const },
    ];
    expect(describeRules(params, {})).toBe("всегда");
    expect(describeRules(params, { f: { flag: true }, c: { min: 2 } })).toBe("Горит — да; Заряд от 2");
  });
});
