import { describe, expect, it } from "vitest";
import type { CaseFile } from "../../../../shared/case";
import { PARTS, PART_NAMES, partOf, registerCaseParts } from "../game/art";
import testCase from "./test-cases/case-test-moveto.json";
import { validateCase } from "./validate";

const base = () => structuredClone(testCase) as unknown as CaseFile;
const errorsOf = (c: CaseFile): string[] => {
  const r = validateCase(c);
  return r.ok ? [] : r.errors;
};
const withPart = (c: CaseFile, patch: object) => ({ ...c, parts: [...(c.parts ?? []), { key: "zz", name: "Тест", slot: "hair", frames: { default: [[0, 0, 2, 2, "$hair"]] }, ...patch }] }) as CaseFile;

describe("части персонажей дела", () => {
  it("тестовое дело с частями проходит проверку", () => {
    expect(errorsOf(base())).toEqual([]);
  });

  it("части дела подключаются к таблицам и убираются вместе с делом", () => {
    validateCase(base());
    expect(partOf("hair", "tuft")).toBeDefined();
    expect(PART_NAMES.hair.tuft).toBeTruthy();
    registerCaseParts([]);
    expect(partOf("hair", "tuft")).toBeUndefined();
    expect(partOf("hair", "short")).toBeDefined();
  });

  it("встроенную часть дело не затирает", () => {
    const before = PARTS.hair.short;
    registerCaseParts([{ key: "short", name: "Подмена", slot: "hair", frames: { default: [[0, 0, 1, 1, "#ffffff"]] } }]);
    expect(PARTS.hair.short).toBe(before);
    registerCaseParts([]);
  });

  it("неизвестный ключ причёски, низа и детали лица — ошибка", () => {
    const c = base();
    const ch = c.characters.find((x) => x.appearance)!;
    ch.appearance = { ...ch.appearance!, hairStyle: "nope" };
    expect(errorsOf(c).join("\n")).toMatch(/нет причёски «nope»/);
    ch.appearance = { ...ch.appearance!, hairStyle: "short", bottom: "nope" };
    expect(errorsOf(c).join("\n")).toMatch(/нет низа «nope»/);
    ch.appearance = { ...ch.appearance!, bottom: "pants", faceParts: ["nope"] };
    expect(errorsOf(c).join("\n")).toMatch(/нет детали лица «nope»/);
  });

  it("часть: выход за границы, неизвестная роль, совпадение со встроенной, дубль", () => {
    expect(errorsOf(withPart(base(), { frames: { default: [[15, 0, 2, 1, "#ffffff"]] } })).join("\n")).toMatch(/part hair\/zz: кадр default: прямоугольник выходит/);
    expect(errorsOf(withPart(base(), { frames: { default: [[0, 0, 1, 1, "$nope"]] } })).join("\n")).toMatch(/неизвестная роль цвета «\$nope»/);
    expect(errorsOf(withPart(base(), { key: "short" })).join("\n")).toMatch(/part hair\/short: ключ совпадает со встроенной/);
    expect(errorsOf(withPart(withPart(base(), {}), {})).join("\n")).toMatch(/part hair\/zz: повторяющийся ключ/);
  });
});
