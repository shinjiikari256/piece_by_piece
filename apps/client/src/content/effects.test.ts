import { describe, expect, it } from "vitest";
import { emptyProgress, applyEffects } from "../../../../shared/conditions";
import type { CaseFile, Effect } from "../../../../shared/case";
import case001 from "./cases/case-001.json";
import { validateCase } from "./validate";

describe("эффект message", () => {
  it("отдаёт тексты по порядку; условие и пустой текст учитываются", () => {
    const fx: Effect[] = [
      { type: "message", text: "Первое" },
      { type: "message", text: "Скрытое", requires: { flags: ["нет"] } },
      { type: "message", text: "   " },
      { type: "message", text: "Второе" },
    ];
    expect(applyEffects(fx, emptyProgress()).messages).toEqual(["Первое", "Второе"]);
  });
  it("валидатор: сообщение без текста — ошибка", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.dialogues[0].nodes[0].effects.push({ type: "message", text: " " });
    const r = validateCase(c);
    expect(r.ok ? "" : r.errors.join("\n")).toContain("нет текста");
  });
});

describe("настройка once у эффекта", () => {
  const inc: Effect = { type: "changeVariable", variableId: "n", action: "add", value: 1, once: true };
  it("срабатывает один раз по ключу места и номера; без site — каждый раз", () => {
    const run = (p: ReturnType<typeof emptyProgress>, site?: string) => applyEffects([inc, { ...inc, once: undefined }], p, { site }).progress;
    const once = run(run(emptyProgress(), "x"), "x");
    expect(once.counters.n).toBe(3); // 1-й вызов: 2, 2-й: только эффект без once
    expect(once.fired).toContain("once:x#0");
    expect(run(run(emptyProgress()), undefined).counters.n).toBe(4); // без site once не отслеживается
    expect(run(run(emptyProgress(), "x"), "y").counters.n).toBe(4); // другое место — свой ключ
  });
  it("эффект с невыполненным requires не тратит once", () => {
    const e: Effect = { ...inc, requires: { flags: ["go"] } };
    const p1 = applyEffects([e], emptyProgress(), { site: "z" }).progress;
    expect(p1.counters.n).toBeUndefined();
    const p2 = applyEffects([e], { ...p1, flags: ["go"] }, { site: "z" }).progress;
    expect(p2.counters.n).toBe(1);
  });
  it("эффекты улики (onCollect) тоже учитывают once", () => {
    const fx: Effect[] = [{ type: "addEvidence", evidenceId: "a" }];
    const out = applyEffects(fx, emptyProgress(), { onCollect: () => [inc] });
    expect(out.progress.counters.n).toBe(1);
    expect(out.progress.fired).toContain("once:collect:a#0");
  });
});

describe("эффекты removeEvidence, startDialogue, travel", () => {
  it("removeEvidence убирает улику и сообщает об этом; повторно — нет", () => {
    const p = { ...emptyProgress(), collected: ["a", "b"] };
    const out = applyEffects(
      [
        { type: "removeEvidence", evidenceId: "a" },
        { type: "removeEvidence", evidenceId: "a" },
      ],
      p,
    );
    expect(out.progress.collected).toEqual(["b"]);
    expect(out.removedEvidence).toEqual(["a"]);
  });
  it("startDialogue и travel отдаются вызывающему, побеждает последний", () => {
    const out = applyEffects(
      [
        { type: "startDialogue", dialogueId: "d1" },
        { type: "startDialogue", dialogueId: "d2" },
        { type: "travel", locationId: "l1", x: 3, y: 4 },
      ],
      emptyProgress(),
    );
    expect(out.followUp).toEqual({ dialogueId: "d2", travel: { to: "l1", spawn: { x: 3, y: 4 } } });
  });
  it("валидатор: ссылки, клетка travel, улика из сопоставления не убирается", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    const used = c.deductions[0].evidenceIds[0];
    c.dialogues[0].nodes[0].effects.push(
      { type: "removeEvidence", evidenceId: used },
      { type: "startDialogue", dialogueId: "нет_диалога" },
      { type: "travel", locationId: "нет_локации", x: 0, y: 0 },
      { type: "travel", locationId: c.locations[0].id, x: 0, y: 0 }, // клетка 0,0 — стена
    );
    const text = (() => {
      const r = validateCase(c);
      return r.ok ? "" : r.errors.join("\n");
    })();
    expect(text).toContain("нельзя убрать");
    expect(text).toContain("нет_диалога");
    expect(text).toContain("перенос игрока — неизвестная локация");
    expect(text).toContain("не пол");
  });
});
