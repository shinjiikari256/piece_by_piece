import { describe, expect, it } from "vitest";
import type { CaseFile, LocationObject } from "../../../../shared/case";
import { startProgress } from "../../../../shared/conditions";
import { activeState } from "../../../../shared/object-state";
import { bindCondition, bindObject, bindSprites, conditionParams } from "../../../../shared/sprite-bindings";
import testCase from "./test-cases/case-test-moveto.json";
import { validateCase } from "./validate";

const base = testCase as unknown as CaseFile;
const beacon = (c: CaseFile = base) => c.locations.flatMap((l) => l.objects).find((o) => o.id === "dec_test_beacon") as LocationObject;
const stateOf = (c: CaseFile, patch: (p: ReturnType<typeof startProgress>) => void) => {
  const p = startProgress(c);
  patch(p);
  return activeState(beacon(bindSprites(c)), p)?.id ?? null;
};

describe("привязка переменных спрайта к переменным дела", () => {
  it("bindCondition заменяет id во всех строках и во вложенных условиях", () => {
    const c = bindCondition(
      { flags: ["a"], notFlags: ["b"], counters: [{ counterId: "n", min: 1 }], enums: [{ enumId: "e", in: ["x"] }], anyOf: [{ flags: ["a"] }] },
      { a: "A", b: "B", n: "N", e: "E" },
    );
    expect(c).toEqual({ flags: ["A"], notFlags: ["B"], counters: [{ counterId: "N", min: 1 }], enums: [{ enumId: "E", in: ["x"] }], anyOf: [{ flags: ["A"] }] });
  });

  it("conditionParams отдаёт переменные и посторонние строки", () => {
    const u = conditionParams({ flags: ["a"], evidence: ["ev"], allOf: [{ counters: [{ counterId: "n" }] }] });
    expect(u.flags).toEqual(["a"]);
    expect(u.counters).toEqual(["n"]);
    expect(u.foreign).toEqual(["evidence"]);
  });

  it("тестовое дело с привязанным маяком проходит проверку", () => {
    expect(validateCase(base).ok).toBe(true);
  });

  it("состояние маяка вычисляется по привязанным переменным дела", () => {
    expect(stateOf(base, () => {})).toBe(null);
    expect(stateOf(base, (p) => p.flags.push("test_fridge_seen"))).toBe("lit");
    expect(stateOf(base, (p) => (p.enums.test_safe = "open"))).toBe("open");
    expect(stateOf(base, (p) => (p.counters.test_trust = 2))).toBe("strong");
    expect(stateOf(base, (p) => (p.counters.test_trust = 1))).toBe(null);
  });

  it("свои состояния предмета важнее состояний спрайта; в исходном деле предмет не меняется", () => {
    const own: LocationObject = { ...beacon(), states: [{ id: "mine", frame: "on" }] };
    expect(bindObject(own, base.sprites![0])).toBe(own);
    expect(beacon().states).toBeUndefined();
    expect(beacon(bindSprites(base)).states?.length).toBe(3);
  });

  it("валидатор: непривязанная переменная, чужой вид, нет значения перечисления, посторонняя строка условия", () => {
    const errs = (c: CaseFile) => {
      const r = validateCase(c);
      return r.ok ? "" : r.errors.join("\n");
    };
    const withObj = (bindings: Record<string, string> | undefined): CaseFile => ({
      ...base,
      locations: base.locations.map((l) => ({ ...l, objects: l.objects.map((o) => (o.id === "dec_test_beacon" ? { ...o, bindings } : o)) })),
    });
    expect(errs(withObj({ lit: "test_fridge_seen", power: "test_trust" }))).toMatch(/«mode» не привязана/);
    expect(errs(withObj({ lit: "test_trust", power: "test_trust", mode: "test_safe" }))).toMatch(/нет такой переменной нужного вида/);
    expect(errs(withObj({ lit: "test_fridge_seen", power: "test_trust", mode: "test_safe", ghost: "test_trust" }))).toMatch(/нет переменной «ghost»/);
    const sp = base.sprites![0];
    const badEnum = { ...base, sprites: [{ ...sp, params: sp.params!.map((q) => (q.id === "mode" ? { ...q, values: [...q.values!, { id: "broken_x", name: "x" }] } : q)) }] };
    expect(errs(badEnum)).toMatch(/нет значения «broken_x»/);
    const badRow = { ...base, sprites: [{ ...sp, states: [{ id: "z", when: { evidence: ["x"] } }] }] };
    expect(errs(badRow)).toMatch(/допустимы только переменные спрайта/);
  });
});
