import { describe, expect, it } from "vitest";
import case002 from "./cases/case-002.json";
import { caseWarnings } from "./warnings";
import { migrateCase } from "../../../../shared/migrate";
import type { CaseFile } from "../../../../shared/case";
import case001 from "./cases/case-001.json";
import { validateCase } from "./validate";

describe("предупреждения дела", () => {
  it("готовые дела без предупреждений о диалогах и областях; ловятся недостижимый диалог, флаг без источника, область без действий", async () => {
    const { caseWarnings } = await import("./warnings");
    expect(caseWarnings(structuredClone(case001) as unknown as CaseFile).filter((w) => w.startsWith("dialogue") || w.includes("/zone"))).toEqual([]);
    const c = structuredClone(case001) as unknown as CaseFile;
    c.dialogues.push({
      id: "dlg_lonely",
      characterId: c.characters[0].id,
      startNodeId: "s",
      nodes: [{ id: "s", text: "…", mood: "neutral", effects: [], choices: [{ id: "end", text: "ок", next: null, effects: [], requires: { flags: ["flag_never_set"] } }] }],
    });
    c.locations[0].zones = [{ id: "z_empty", name: "Пустая", cells: [{ x: 1, y: 1 }], actions: [] }];
    const text = caseWarnings(c).join("\n");
    expect(text).toContain("dialogue dlg_lonely: никто не запускает");
    expect(text).toContain("zone z_empty: у области нет действий");
    expect(text).toContain("flag flag_never_set: условия ждут этот флаг");
  });
  it("счётчики: условие вне границ и счётчик, который никто не меняет", async () => {
    const { caseWarnings } = await import("./warnings");
    const c = structuredClone(case001) as unknown as CaseFile;
    c.counters = [
      { id: "k_out", name: "Вне", initial: 0, min: 0, max: 5 },
      { id: "k_stuck", name: "Стоит", initial: 0 },
    ];
    c.dialogues.push({
      id: "dlg_k",
      characterId: c.characters[0].id,
      startNodeId: "s",
      nodes: [
        {
          id: "s",
          text: "…",
          mood: "neutral",
          effects: [],
          choices: [
            { id: "a", text: "a", next: null, effects: [], requires: { counters: [{ counterId: "k_out", min: 6 }] } },
            { id: "b", text: "b", next: null, effects: [], requires: { counters: [{ counterId: "k_stuck", min: 1 }] } },
            { id: "c", text: "c", next: null, effects: [] },
          ],
        },
      ],
    });
    const text = caseWarnings(c).join("\n");
    expect(text).toContain("counter k_out: условие требует значение вне границ");
    expect(text).toContain("counter k_stuck: никакой эффект не меняет счётчик");
  });
});

describe("узлы-переходы: предупреждения", () => {
  it("нет варианта без условия и цикл переходов", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    const dlg = c.dialogues[0];
    dlg.nodes.push(
      { id: "r1", mood: "neutral", text: "", effects: [], auto: true, choices: [{ id: "x", text: "", next: "r2", effects: [], requires: { flags: ["f"] } }] },
      { id: "r2", mood: "neutral", text: "", effects: [], auto: true, choices: [{ id: "y", text: "", next: "r1", effects: [] }] },
    );
    const text = caseWarnings(c).join("\n");
    expect(text).toContain("у перехода нет варианта без условия");
    expect(text).toContain("переходы идут по кругу");
  });
});

describe("старт игрока: один на дело", () => {
  const two = () => {
    const c = structuredClone(case002) as unknown as CaseFile;
    return c;
  };
  it("валидатор требует ровно одну клетку старта", () => {
    const none = two();
    none.locations.forEach((l) => delete l.playerStart);
    expect(validateCase(none).ok === false && (validateCase(none) as { errors: string[] }).errors.join("\n")).toContain("ровно одна");
    const many = two();
    many.locations[1].playerStart = { ...many.locations[0].playerStart! };
    expect(validateCase(many).ok).toBe(false);
  });
  it("миграция 3 → 4 оставляет старт только у первой локации", () => {
    const old = structuredClone(case002) as unknown as Record<string, unknown>;
    (old.locations as { playerStart?: unknown }[]).forEach((l) => (l.playerStart = { x: 1, y: 1 }));
    old.formatVersion = 3;
    const r = migrateCase(old);
    expect(r.ok && (r.data.locations as { playerStart?: unknown }[]).map((l) => !!l.playerStart)).toEqual([true, ...Array(case002.locations.length - 1).fill(false)]);
  });
});

describe("предмет (kind: item): ключ, фонарь — не улика", () => {
  const withItem = () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.evidence.push({ id: "key_412", title: "Ключ от 412", description: "", details: "", kind: "item", relatedCharacters: [], relatedEvents: [], reliability: "high", onCollect: [] });
    c.dialogues[0].nodes[0].effects.push({ type: "addEvidence", evidenceId: "key_412" });
    return c;
  };
  it("предмет можно выдавать и проверять в условиях как любой материал", () => {
    const c = withItem();
    c.dialogues[0].nodes[0].choices[0].requires = { evidence: ["key_412"] };
    expect(validateCase(c).ok).toBe(true);
  });
  it("валидатор: предмет нельзя класть в сопоставление и в варианты вопроса про улики", () => {
    const c = withItem();
    c.deductions[0].evidenceIds = [c.deductions[0].evidenceIds[0], "key_412"];
    const r = validateCase(c);
    expect(r.ok ? "" : r.errors.join("\n")).toContain("предмет, а не улика");
  });
  it("вопрос про улики не требует варианта для предмета", () => {
    const c = withItem();
    const q = c.questions.find((x) => x.source === "evidence");
    if (!q) return; // в деле нет такого вопроса — проверять нечего
    const r = validateCase(c);
    const text = r.ok ? "" : r.errors.join("\n");
    expect(text).not.toContain("нет варианта для улики «key_412»");
  });
});
