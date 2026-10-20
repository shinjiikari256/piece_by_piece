import { describe, expect, it } from "vitest";
import type { CaseFile, LocationObject } from "../../../../shared/case";
import { isInteractive } from "../../../../shared/case";
import { startProgress } from "../../../../shared/conditions";
import { activeState, currentInteraction } from "../../../../shared/object-state";
import testCase from "./test-cases/case-test-moveto.json";
import { validateCase } from "./validate";

const base = testCase as unknown as CaseFile;
const safe = (): LocationObject => base.locations.flatMap((l) => l.objects).find((o) => o.id === "dec_safe")!;
const withEnum = (value: string) => {
  const p = startProgress(base);
  return { ...p, enums: { ...p.enums, test_safe: value } };
};

describe("состояния предметов", () => {
  it("первое подходящее по порядку; нет подходящего — вид по умолчанию", () => {
    expect(activeState(safe(), withEnum("closed"))).toBeNull();
    expect(activeState(safe(), withEnum("open"))?.id).toBe("open");
    expect(activeState(safe(), withEnum("broken"))?.id).toBe("broken");
  });

  it("состояние без условия подходит всегда, но уступает более раннему", () => {
    const o = { states: [{ id: "a", when: { flags: ["f"] } }, { id: "z" }] } as LocationObject;
    const p = startProgress(base);
    expect(activeState(o, p)?.id).toBe("z");
    expect(activeState(o, { ...p, flags: ["f"] })?.id).toBe("a");
  });

  it("окно осмотра берётся из состояния; предмет без своего окна интерактивен через состояние", () => {
    const o = safe();
    expect(o.interaction).toBeNull();
    expect(isInteractive(o)).toBe(true);
    expect(currentInteraction(o, withEnum("closed"))).toBeNull();
    expect(currentInteraction(o, withEnum("open"))?.title).toBe("Сейф открыт");
  });

  it("null в состоянии убирает окно, пропущенное поле оставляет окно предмета", () => {
    const o = {
      interaction: { title: "Шкаф", description: "." },
      states: [{ id: "hidden", when: { flags: ["h"] }, interaction: null }, { id: "plain" }],
    } as LocationObject;
    const p = startProgress(base);
    expect(currentInteraction(o, p)?.title).toBe("Шкаф");
    expect(currentInteraction(o, { ...p, flags: ["h"] })).toBeNull();
  });

  it("тестовое дело с состояниями проходит проверку", () => {
    expect(validateCase(base)).toMatchObject({ ok: true });
  });

  it("валидатор: нет кадра, повтор id и неизвестная улика в условии состояния", () => {
    const d = structuredClone(base);
    const o = d.locations.flatMap((l) => l.objects).find((x) => x.id === "dec_safe")!;
    o.states!.push({ id: "open", frame: "нет_такого", when: { evidence: ["нет_улики"] } });
    const res = validateCase(d);
    const errors = res.ok ? "" : res.errors.join("\n");
    expect(errors).toContain("нет кадра нет_такого");
    expect(errors).toContain("dec_safe");
    expect(errors).toContain("нет_улики");
  });
});
