import { describe, expect, it } from "vitest";
import { emptyProgress, applyEffects, choiceKey, meets } from "../../../../shared/conditions";
import { deleteFlag, flagUsage } from "../editor/fields/variables";
import { caseWarnings } from "./warnings";
import type { CaseFile, Condition, Effect } from "../../../../shared/case";
import case001 from "./cases/case-001.json";
import { validateCase } from "./validate";

describe("условие у эффекта (requires)", () => {
  const eff = (requires?: Condition): Effect => ({ type: "changeVariable", variableId: "hp", action: "add", value: 1, ...(requires ? { requires } : {}) });
  it("применяется только при выполненном условии, по состоянию после предыдущих эффектов", () => {
    const p = emptyProgress();
    expect(applyEffects([eff({ flags: ["go"] })], p).progress.counters.hp).toBeUndefined();
    const set: Effect = { type: "changeVariable", variableId: "go", action: "on" };
    // флаг ставится первым эффектом списка — второй уже видит его
    expect(applyEffects([set, eff({ flags: ["go"] })], p).progress.counters.hp).toBe(1);
    expect(applyEffects([eff({ flags: ["go"] }), set], p).progress.counters.hp).toBeUndefined();
  });
  it("inLocation берёт текущую локацию игрока", () => {
    const e = eff({ inLocation: ["hall"] });
    expect(applyEffects([e], emptyProgress(), { locationId: "hall" }).progress.counters.hp).toBe(1);
    expect(applyEffects([e], emptyProgress(), { locationId: "yard" }).progress.counters.hp).toBeUndefined();
  });
  it("валидатор проверяет ссылки в условии эффекта; deleteFlag убирает флаг из условия", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.dialogues[0].nodes[0].effects.push({ type: "addCharacterNote", characterId: c.characters[0].id, text: "t", requires: { evidence: ["нет_такой"] } });
    const r = validateCase(c);
    expect(r.ok ? "" : r.errors.join("\n")).toContain("условие эффекта");
    c.flags = [{ id: "f1", name: "Флаг" }];
    c.dialogues[0].nodes[0].effects = [{ type: "addCharacterNote", characterId: c.characters[0].id, text: "t", requires: { flags: ["f1"] } }];
    const out = deleteFlag(c, "f1");
    expect(out.dialogues[0].nodes[0].effects[0].requires).toBeUndefined();
  });
});

describe("условия: «или» и «игрок в локации»", () => {
  const p = { ...emptyProgress(), flags: ["a"] };
  it("anyOf: подходит любой вариант, остальные строки обязательны", () => {
    expect(meets({ anyOf: [{ flags: ["x"] }, { flags: ["a"] }] }, p)).toBe(true);
    expect(meets({ anyOf: [{ flags: ["x"] }, { flags: ["y"] }] }, p)).toBe(false);
    expect(meets({ flags: ["x"], anyOf: [{ flags: ["a"] }] }, p)).toBe(false);
    expect(meets({ anyOf: [] }, p)).toBe(true);
  });
  it("inLocation: игрок в одной из локаций; без места — не выполняется", () => {
    expect(meets({ inLocation: ["l1", "l2"] }, p, "l2")).toBe(true);
    expect(meets({ inLocation: ["l1"] }, p, "l2")).toBe(false);
    expect(meets({ inLocation: ["l1"] }, p)).toBe(false);
    expect(meets({ anyOf: [{ inLocation: ["l1"] }, { flags: ["a"] }] }, p, "l2")).toBe(true);
  });
});

it("валидатор: неизвестная локация в inLocation (в том числе внутри anyOf)", () => {
  const c = structuredClone(case001) as unknown as CaseFile;
  c.locations[0].objects.push({
    id: "d_or",
    sprite: "door_h",
    x: 0,
    y: 0,
    label: "",
    interaction: null,
    onInteract: [],
    states: [{ id: "s", when: { anyOf: [{ inLocation: ["нет_такой"] }] } }],
  } as never);
  const r = validateCase(c);
  expect(r.ok === false && r.errors.some((e) => e.includes("нет_такой"))).toBe(true);
});

describe("условия-отрицания: notEvidence, notDeductions", () => {
  it("meets: ни одной из улик и ни одного из выводов", () => {
    const p = { ...emptyProgress(), collected: ["a"], deductions: ["d1"] };
    expect(meets({ notEvidence: ["b", "c"] }, p)).toBe(true);
    expect(meets({ notEvidence: ["b", "a"] }, p)).toBe(false);
    expect(meets({ notDeductions: ["d2"] }, p)).toBe(true);
    expect(meets({ notDeductions: ["d2", "d1"] }, p)).toBe(false);
  });
  it("валидатор проверяет ссылки в отрицаниях", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.dialogues[0].nodes[0].choices[0].requires = { notEvidence: ["нет_такой"], notDeductions: ["нет_вывода"] };
    const r = validateCase(c);
    const text = r.ok ? "" : r.errors.join("\n");
    expect(text).toContain("нет_такой");
    expect(text).toContain("нет_вывода");
  });
});

describe("условия chosen и notInLocation", () => {
  const key = choiceKey("d", "n", "c");
  it("chosen: вариант уже выбирался / ещё не выбирался", () => {
    const row = { dialogueId: "d", nodeId: "n", choiceId: "c" };
    const before = emptyProgress();
    const after = { ...before, chosen: [key] };
    expect(meets({ chosen: [row] }, before)).toBe(false);
    expect(meets({ chosen: [row] }, after)).toBe(true);
    expect(meets({ chosen: [{ ...row, not: true }] }, before)).toBe(true);
    expect(meets({ chosen: [{ ...row, not: true }] }, after)).toBe(false);
  });
  it("notInLocation: не в перечисленных; локация неизвестна — условие не мешает", () => {
    expect(meets({ notInLocation: ["a", "b"] }, emptyProgress(), "c")).toBe(true);
    expect(meets({ notInLocation: ["a", "b"] }, emptyProgress(), "b")).toBe(false);
    expect(meets({ notInLocation: ["a"] }, emptyProgress())).toBe(true);
  });
  it("валидатор: несуществующий вариант и локация", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.dialogues[0].nodes[0].choices[0].requires = { chosen: [{ dialogueId: "нет", nodeId: "x", choiceId: "y" }], notInLocation: ["нет_локации"] };
    const r = validateCase(c);
    const text = r.ok ? "" : r.errors.join("\n");
    expect(text).toContain("не найден");
    expect(text).toContain("нет_локации");
  });
});

describe("человек на карте по условию; диалог не застревает", () => {
  it("npc.requires: проверяется валидатором, учитывается в «где используется» и при удалении флага", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.flags = [{ id: "show", name: "Показать" }];
    c.locations[0].npcs[0].requires = { flags: ["show"], evidence: ["нет_улики"] };
    const r = validateCase(c);
    expect(r.ok ? "" : r.errors.join("\n")).toContain("нет_улики");
    c.locations[0].npcs[0].requires = { flags: ["show"] };
    expect(
      flagUsage(c)
        .get("show")
        ?.some((u) => u.where.startsWith("Человек на карте")),
    ).toBe(true);
    expect(deleteFlag(c, "show").locations[0].npcs[0].requires).toBeUndefined();
  });
  it("предупреждение: у всех вариантов реплики есть условие", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    const node = c.dialogues[0].nodes[0];
    node.choices.forEach((ch) => (ch.requires = { flags: ["x"] }));
    expect(caseWarnings(c).join("\n")).toContain("останется только «Закончить разговор»");
  });
});
