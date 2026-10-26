import { describe, expect, it } from "vitest";
import { emptyProgress, applyEffects, meets, startProgress } from "../../../../shared/conditions";
import { deleteCounter } from "../editor/sections/Counters";
import { evidenceUsage, flagUsage } from "../editor/fields/variables";
import { deleteEnum, deleteEnumValue, renameEnumValue } from "../editor/sections/Enums";
import { caseWarnings } from "./warnings";
import { countRefs, renameKey } from "../editor/keys";
import type { CaseFile } from "../../../../shared/case";
import case001 from "./cases/case-001.json";
import { validateCase } from "./validate";

describe("эффект changeVariable: флаги", () => {
  it("снимает флаг, повторно — безопасно; исходное состояние не меняется", () => {
    const start = { ...emptyProgress(), flags: ["a", "b"] };
    const { progress } = applyEffects(
      [
        { type: "changeVariable", variableId: "a", action: "off" },
        { type: "changeVariable", variableId: "нет_такого", action: "off" },
      ],
      start,
    );
    expect(progress.flags).toEqual(["b"]);
    expect(start.flags).toEqual(["a", "b"]);
  });
  it("on ставит один раз, toggle переключает", () => {
    const on = (a: "on" | "toggle", p = emptyProgress()) => applyEffects([{ type: "changeVariable", variableId: "f", action: a }], p).progress;
    const once = on("on", on("on"));
    expect(once.flags).toEqual(["f"]);
    expect(on("toggle", once).flags).toEqual([]);
    expect(on("toggle", on("toggle", once)).flags).toEqual(["f"]);
  });
});

describe("счётчики и начальные флаги", () => {
  const withCounters = () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.counters = [{ id: "trust", name: "Доверие", initial: 2 }];
    c.flags = [...(c.flags ?? []), { id: "ready", name: "Готово", initial: true }];
    return c;
  };
  it("startProgress: начальные флаги и значения счётчиков", () => {
    const p = startProgress(withCounters());
    expect(p.flags).toContain("ready");
    expect(p.counters).toEqual({ trust: 2 });
  });
  it("changeCounter: прибавить / задать; условие по границам", () => {
    const p = startProgress(withCounters());
    const up = applyEffects([{ type: "changeVariable", variableId: "trust", action: "add", value: 3 }], p).progress;
    expect(up.counters.trust).toBe(5);
    expect(p.counters.trust).toBe(2); // исходное не меняется
    expect(applyEffects([{ type: "changeVariable", variableId: "trust", action: "set", value: -1 }], up).progress.counters.trust).toBe(-1);
    expect(meets({ counters: [{ counterId: "trust", min: 3, max: 5 }] }, up)).toBe(true);
    expect(meets({ counters: [{ counterId: "trust", min: 6 }] }, up)).toBe(false);
    expect(meets({ counters: [{ counterId: "none", max: 0 }] }, up)).toBe(true); // нет значения — 0
    expect(applyEffects([{ type: "changeVariable", variableId: "trust", action: "subtract", value: 4 }], up).progress.counters.trust).toBe(1);
  });
  it("границы счётчика: эффекты и начальное значение не выходят за min/max", () => {
    const defs = [{ id: "hp", min: 0, max: 10 }];
    const fx = (action: "add" | "subtract" | "set", value: number, p = emptyProgress()) => applyEffects([{ type: "changeVariable", variableId: "hp", action, value }], p, { counters: defs }).progress;
    const full = fx("add", 99);
    expect(full.counters.hp).toBe(10);
    expect(fx("subtract", 99, full).counters.hp).toBe(0);
    expect(fx("set", -5).counters.hp).toBe(0);
    expect(startProgress({ counters: [{ id: "hp", initial: 50, max: 10 }] }).counters.hp).toBe(10);
  });
  it("валидатор: счётчик без названия, неизвестная ссылка, «от» больше «до»", () => {
    const c = withCounters();
    c.counters![0].name = " ";
    c.dialogues[0].nodes[0].effects.push({ type: "changeVariable", variableId: "нет", action: "add", value: 1 });
    c.locations[0].objects.push({
      id: "d_cnt",
      sprite: "door_h",
      x: 0,
      y: 0,
      label: "",
      interaction: null,
      onInteract: [],
      states: [{ id: "s", when: { counters: [{ counterId: "trust", min: 5, max: 1 }] } }],
    } as never);
    const r = validateCase(c);
    const text = r.ok ? "" : r.errors.join("\n");
    expect(text).toContain("нет названия");
    expect(text).toContain("неизвестная ссылка «нет»");
    expect(text).toContain("«от» больше «до»");
  });
  it("deleteCounter убирает счётчик, эффекты и строки условий", () => {
    const c = withCounters();
    c.dialogues[0].nodes[0].effects.push({ type: "changeVariable", variableId: "trust", action: "add", value: 1 });
    c.dialogues[0].nodes[0].choices[0].requires = { counters: [{ counterId: "trust", min: 1 }] };
    const out = deleteCounter(c, "trust");
    expect(out.counters).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("trust");
    expect(out.dialogues[0].nodes[0].choices[0].requires).toBeUndefined();
  });
});

describe("перечисления", () => {
  const withEnum = () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.enums = [
      {
        id: "safe",
        name: "Сейф",
        values: [
          { id: "closed", name: "Закрыт" },
          { id: "open", name: "Открыт" },
          { id: "broken", name: "Сломан" },
        ],
      },
    ];
    return c;
  };
  it("startProgress: начальное значение — заданное или первое", () => {
    const c = withEnum();
    expect(startProgress(c).enums).toEqual({ safe: "closed" });
    c.enums![0].initial = "open";
    expect(startProgress(c).enums).toEqual({ safe: "open" });
  });
  it("assign выбирает значение; in / notIn в условиях", () => {
    const p = startProgress(withEnum());
    const open = applyEffects([{ type: "changeVariable", variableId: "safe", action: "assign", valueId: "open" }], p).progress;
    expect(open.enums.safe).toBe("open");
    expect(p.enums.safe).toBe("closed"); // исходное не меняется
    expect(meets({ enums: [{ enumId: "safe", in: ["open", "broken"] }] }, open)).toBe(true);
    expect(meets({ enums: [{ enumId: "safe", in: ["closed"] }] }, open)).toBe(false);
    expect(meets({ enums: [{ enumId: "safe", notIn: ["closed"] }] }, open)).toBe(true);
    expect(meets({ enums: [{ enumId: "safe", notIn: ["open"] }] }, open)).toBe(false);
  });
  it("валидатор: ключ занят флагом, значения, ссылки в эффекте и условии", () => {
    const c = withEnum();
    c.flags = [{ id: "safe", name: "Флаг" }];
    c.enums![0].initial = "нет";
    c.dialogues[0].nodes[0].effects.push({ type: "changeVariable", variableId: "safe", action: "assign", valueId: "нет_значения" });
    c.dialogues[0].nodes[0].effects.push({ type: "changeVariable", variableId: "safe", action: "on" });
    c.dialogues[0].nodes[0].choices[0].requires = { enums: [{ enumId: "safe", in: ["нет_значения"] }] };
    const r = validateCase(c);
    const text = r.ok ? "" : r.errors.join("\n");
    expect(text).toContain("занят и флагом, и перечислением");
    expect(text).toContain("начальное значение");
    expect(text).toContain("нет значения «нет_значения»");
    expect(text).toContain("перечисление, а действие над флагом");
  });
  it("deleteEnumValue, renameEnumValue и deleteEnum чистят эффекты и условия", () => {
    const c = withEnum();
    c.dialogues[0].nodes[0].effects.push({ type: "changeVariable", variableId: "safe", action: "assign", valueId: "open" });
    c.dialogues[0].nodes[0].choices[0].requires = { enums: [{ enumId: "safe", in: ["open"] }] };
    const renamed = renameEnumValue(c, "safe", "open", "opened");
    expect(JSON.stringify(renamed)).not.toContain('"open"');
    expect(renamed.dialogues[0].nodes[0].choices[0].requires).toEqual({ enums: [{ enumId: "safe", in: ["opened"] }] });
    const noValue = deleteEnumValue(c, "safe", "open");
    expect(noValue.enums![0].values.map((v) => v.id)).toEqual(["closed", "broken"]);
    expect(noValue.dialogues[0].nodes[0].choices[0].requires).toBeUndefined();
    expect(noValue.dialogues[0].nodes[0].effects.some((e) => e.type === "changeVariable")).toBe(false);
    const gone = deleteEnum(c, "safe");
    expect(gone.enums).toBeUndefined();
    expect(JSON.stringify(gone)).not.toContain("safe");
  });
  it("предупреждение: условие ждёт значение, которое никто не выбирает", () => {
    const c = withEnum();
    c.dialogues[0].nodes[0].choices[0].requires = { enums: [{ enumId: "safe", in: ["broken"] }] };
    expect(caseWarnings(c).join("\n")).toContain("«broken»");
    c.dialogues[0].nodes[0].effects.push({ type: "changeVariable", variableId: "safe", action: "assign", valueId: "broken" });
    expect(caseWarnings(c).join("\n")).not.toContain("«broken»");
  });
});

describe("переименование ключа переменной", () => {
  it("renameKey обновляет variableId в эффектах и enumId в условиях", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.counters = [{ id: "hp", name: "Здоровье" }];
    c.dialogues[0].nodes[0].effects.push({ type: "changeVariable", variableId: "hp", action: "add", value: 1 });
    const out = renameKey(c as unknown as Record<string, unknown>, "hp", "health") as unknown as CaseFile;
    expect(out.dialogues[0].nodes[0].effects.at(-1)).toMatchObject({ variableId: "health" });
    expect(countRefs(c as unknown as Record<string, unknown>, "hp")).toBeGreaterThan(0);
  });
});

describe("«где используется»: счётчики, перечисления, улики", () => {
  const base = () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.counters = [{ id: "hp", name: "Здоровье" }];
    c.enums = [
      {
        id: "safe",
        name: "Сейф",
        values: [
          { id: "closed", name: "Закрыт" },
          { id: "open", name: "Открыт" },
        ],
      },
    ];
    const node = c.dialogues[0].nodes[0];
    node.effects.push({ type: "changeVariable", variableId: "hp", action: "subtract", value: 1 }, { type: "changeVariable", variableId: "safe", action: "assign", valueId: "open" });
    node.choices[0].requires = { counters: [{ counterId: "hp", min: 1 }], enums: [{ enumId: "safe", in: ["open"] }], notEvidence: [c.evidence[0].id] };
    return c;
  };
  it("переменные: действия эффектов и проверки условий", () => {
    const usage = flagUsage(base());
    expect(usage.get("hp")?.map((u) => u.kind)).toEqual(expect.arrayContaining(["отнимает", "проверяет значение"]));
    expect(usage.get("safe")?.map((u) => u.kind)).toEqual(expect.arrayContaining(["выбирает значение", "проверяет значение"]));
  });
  it("улики: условия, сопоставления, убирание и выдача", () => {
    const c = base();
    const id = c.deductions[0].evidenceIds[0];
    c.dialogues[0].nodes[0].effects.push({ type: "removeEvidence", evidenceId: id });
    const kinds = (evidenceUsage(c).get(id) ?? []).map((u) => u.kind);
    expect(kinds).toEqual(expect.arrayContaining(["в сопоставлении", "убирает из дела"]));
    expect((evidenceUsage(c).get(c.evidence[0].id) ?? []).map((u) => u.kind)).toContain("проверяет отсутствие");
  });
});
