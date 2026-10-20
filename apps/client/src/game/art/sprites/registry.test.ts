import { afterEach, describe, expect, it } from "vitest";
import type { CaseFile, CustomSprite } from "../../../../../../shared/case";
import testCase from "../../../content/test-cases/case-test-moveto.json";
import { validateCase } from "../../../content/validate";
import { SPRITES, SPRITE_NAMES, drawSprite, registerCaseSprites, spriteVersion } from "../../art";

const base = testCase as unknown as CaseFile;
const lamp = base.sprites![0];

afterEach(() => registerCaseSprites(undefined));

describe("спрайты дела", () => {
  it("регистрация добавляет спрайт и название, замена — убирает прежние, версия растёт только при изменениях", () => {
    const v0 = spriteVersion();
    registerCaseSprites([lamp]);
    const v1 = spriteVersion();
    expect(v1).toBeGreaterThan(v0);
    expect(SPRITES[lamp.key]).toBeTruthy();
    expect(SPRITE_NAMES[lamp.key]).toBe(lamp.name);
    registerCaseSprites([lamp]);
    expect(spriteVersion()).toBe(v1);
    registerCaseSprites([]);
    expect(SPRITES[lamp.key]).toBeUndefined();
    expect(SPRITE_NAMES[lamp.key]).toBeUndefined();
  });

  it("встроенный ключ затереть нельзя", () => {
    const before = SPRITES.desk;
    registerCaseSprites([{ ...lamp, key: "desk" }]);
    expect(SPRITES.desk).toBe(before);
  });

  it("кадры спрайта дела рисуются", () => {
    registerCaseSprites([lamp]);
    const calls: string[] = [];
    const ctx = { fillRect: () => calls.push("r"), clearRect: () => calls.push("c"), set fillStyle(_v: string) {} } as unknown as CanvasRenderingContext2D;
    drawSprite(ctx, SPRITES[lamp.key], "on");
    expect(calls.length).toBe(lamp.frames.on.length);
  });

  it("тестовое дело со спрайтом дела проходит проверку; предмет на карте использует его", () => {
    expect(validateCase(base).ok).toBe(true);
    expect(base.locations.some((l) => l.objects.some((o) => o.sprite === lamp.key))).toBe(true);
  });

  it("валидатор: неизвестный спрайт, встроенный ключ, выход за размер, клетка вне опоры, нет названия", () => {
    const withSprite = (patch: Partial<CustomSprite>): CaseFile => ({ ...base, sprites: [{ ...lamp, ...patch }] });
    const errs = (c: CaseFile) => {
      const r = validateCase(c);
      return r.ok ? [] : r.errors;
    };
    expect(errs({ ...base, sprites: [] }).join("\n")).toMatch(/нет спрайта «test_beacon»/);
    expect(errs(withSprite({ key: "desk" })).join("\n")).toMatch(/совпадает со встроенным/);
    expect(errs(withSprite({ frames: { default: [[10, 0, 12, 4, "#000000"]] } })).join("\n")).toMatch(/выходит за размер/);
    expect(errs(withSprite({ cells: [{ dx: 3, dy: 0, solid: false }] })).join("\n")).toMatch(/вне опоры/);
    expect(errs(withSprite({ name: " " })).join("\n")).toMatch(/не задано название/);
  });
});
