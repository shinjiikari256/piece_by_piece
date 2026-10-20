import { describe, expect, it } from "vitest";
import type { Condition } from "../../../../shared/case";
import { addAtom, conditionToModel, describeFormula, formulaOf, modelToCondition, parseFormula, removeAtom, replaceAtom } from "../../../../shared/condition-formula";
import { emptyProgress, meets } from "../../../../shared/conditions";
import { validateCase } from "./validate";
import { formSchema } from "../editor/json-schema";
import { CaseFile } from "../../../../shared/case";
import case001 from "./cases/case-001.json";

/** Условие из формулы над готовыми строками (по номерам). */
const build = (atoms: Condition[], formula: string): Condition => {
  const parsed = parseFormula(formula, atoms.length);
  if (!parsed.ok) throw new Error(parsed.error);
  return modelToCondition({ atoms, ast: parsed.ast });
};
const A: Condition = { flags: ["a"] };
const B: Condition = { evidence: ["b"] };
const C: Condition = { notFlags: ["c"] };
const D: Condition = { inLocation: ["hall"] };

describe("формула условий: разбор и запись", () => {
  it("приоритет: && сильнее ||; русские связки; скобки", () => {
    const f = (t: string, n = 3) => {
      const r = parseFormula(t, n);
      if (!r.ok) throw new Error(r.error);
      return formulaOf(r.ast);
    };
    expect(f("1 || 3 && 2")).toBe("1 || 2 && 3".replace("2 && 3", "3 && 2"));
    expect(f("1 и (2 или 3)")).toBe("1 && (2 || 3)");
    expect(f("(1 || 2) && 3")).toBe("(1 || 2) && 3");
    expect(f("1 & 2 | 3")).toBe("1 && 2 || 3");
  });
  it("слова", () => {
    const r = parseFormula("1 или 3 и 2", 3);
    expect(r.ok && describeFormula(r.ast)).toBe("1 или (3 и 2)");
  });
  it("ошибки: неизвестный номер, повтор, пропуск, скобки, пустая формула", () => {
    const err = (t: string, n = 3) => {
      const r = parseFormula(t, n);
      return r.ok ? "" : r.error;
    };
    expect(err("1 && 4")).toContain("Нет условия №4");
    expect(err("1 && 1 && 2 && 3")).toContain("дважды");
    expect(err("1 && 2")).toContain("№3 не входит");
    expect(err("(1 && 2 && 3")).toContain("скобка");
    expect(err("1 && 2 && 3)")).toContain("скобка");
    expect(err("1 2 3")).toContain("связка");
    expect(err("1 && ")).toContain("оборвана");
    expect(err("")).toContain("пуста");
    expect(err("1 ++ 2 && 3")).toContain("Неожиданный");
  });
});

describe("формула условий: условие в деле", () => {
  const P = (flags: string[], collected: string[] = [], locationId?: string) => ({ p: { ...emptyProgress(), flags, collected }, locationId });
  const ok = (cond: Condition, flags: string[], collected: string[] = [], loc?: string) => {
    const { p, locationId } = P(flags, collected, loc);
    return meets(cond, p, locationId);
  };
  it("все сразу — обычные строки узла, без вложенности", () => {
    expect(build([A, B, C], "1 && 2 && 3")).toEqual({ flags: ["a"], evidence: ["b"], notFlags: ["c"] });
  });
  it("1 || 3 && 2: одно из — первое, или второе вместе с третьим", () => {
    const cond = build([A, B, C], "1 || 3 && 2");
    expect(cond).toEqual({ anyOf: [{ flags: ["a"] }, { notFlags: ["c"], evidence: ["b"] }] });
    expect(ok(cond, ["a"])).toBe(true);
    expect(ok(cond, [], ["b"])).toBe(true); // нет флага c — «флагов нет» выполняется
    expect(ok(cond, ["c"], ["b"])).toBe(false);
  });
  it("(1 || 2) && (3 || 4): две группы «или» — через allOf", () => {
    const cond = build([A, B, C, D], "(1 || 2) && (3 || 4)");
    expect(cond.anyOf).toBeDefined();
    expect(cond.allOf).toHaveLength(1);
    expect(ok(cond, ["a"], [], "hall")).toBe(true);
    expect(ok(cond, ["a", "c"], [], "yard")).toBe(false); // вторая группа: флаг c стоит, а локация не та
    expect(ok(cond, ["a", "c"], [], "hall")).toBe(true);
    expect(ok(cond, ["z"], [], "hall")).toBe(false); // первая группа не выполнена
  });
  it("две строки одного вида не сливаются: вторая уходит в allOf", () => {
    const cond = build([{ flags: ["a"] }, { flags: ["b"] }], "1 && 2");
    expect(cond).toEqual({ flags: ["a"], allOf: [{ flags: ["b"] }] });
    expect(conditionToModel(cond).atoms).toHaveLength(2);
    expect(ok(cond, ["a"])).toBe(false);
    expect(ok(cond, ["a", "b"])).toBe(true);
  });
  it("круг: условие → модель → условие эквивалентно, формула стабильна", () => {
    for (const formula of ["1 && 2 && 3", "1 || 2 && 3", "1 && (2 || 3)", "(1 || 2) && 3", "1 && 2 || 3"]) {
      const cond = build([A, B, C], formula);
      const model = conditionToModel(cond);
      expect(model.atoms).toHaveLength(3);
      const again = modelToCondition(model);
      expect(again).toEqual(cond);
      expect(formulaOf(conditionToModel(again).ast)).toBe(formulaOf(model.ast));
    }
  });
  it("старое условие (строки + anyOf) читается как есть и не меняется при записи", () => {
    const old: Condition = { flags: ["a"], anyOf: [{ evidence: ["b"] }, { notFlags: ["c"] }] };
    const model = conditionToModel(old);
    expect(formulaOf(model.ast)).toBe("1 && (2 || 3)");
    expect(modelToCondition(model)).toEqual(old);
  });
  it("пустая альтернатива «или» — всегда верно: группа выпадает", () => {
    const model = conditionToModel({ flags: ["a"], anyOf: [{}, { evidence: ["b"] }] });
    expect(formulaOf(model.ast)).toBe("1");
  });
});

describe("формула условий: правки строк", () => {
  it("добавление — в конец через «и», удаление сдвигает номера и убирает пустые группы", () => {
    const cond = build([A, B, C], "1 || 2 && 3");
    let m = conditionToModel(cond);
    m = addAtom(m, D);
    expect(formulaOf(m.ast)).toBe("(1 || 2 && 3) && 4".replace("(1 || 2 && 3)", "(1 || 2 && 3)"));
    m = removeAtom(m, 1);
    expect(formulaOf(m.ast)).toBe("(1 && 2) && 3".replace("(1 && 2)", "1 && 2"));
    m = removeAtom(m, 1);
    m = removeAtom(m, 1);
    expect(m.atoms).toHaveLength(1);
    expect(formulaOf(m.ast)).toBe("1");
    m = removeAtom(m, 1);
    expect(m.ast).toBeNull();
    expect(modelToCondition(m)).toEqual({});
  });
  it("замена содержимого строки не трогает формулу", () => {
    const m = replaceAtom(conditionToModel(build([A, B], "1 || 2")), 2, { evidence: ["z"] });
    expect(modelToCondition(m)).toEqual({ anyOf: [{ flags: ["a"] }, { evidence: ["z"] }] });
  });
});

describe("рекурсивное условие в деле", () => {
  it("валидатор проверяет ссылки внутри allOf/anyOf любой глубины", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.dialogues[0].nodes[0].choices[0].requires = { anyOf: [{ allOf: [{ evidence: ["нет_улики"] }] }] };
    const r = validateCase(c);
    expect(r.ok ? "" : r.errors.join("\n")).toContain("нет_улики");
  });
  it("форма: ссылки на условие заменены заглушкой, $ref не остаётся", () => {
    const text = JSON.stringify(formSchema(CaseFile));
    expect(text).not.toContain("$ref");
    expect(text).not.toContain("$defs");
  });
});
