import { describe, expect, it } from "vitest";
import type { CaseFile, LocationObject } from "../../../../shared/case";
import { isInteractive } from "../../../../shared/case";
import { applyEffects, startProgress } from "../../../../shared/conditions";
import { activeState, currentInteraction, objectView } from "../../../../shared/object-state";
import testCase from "./test-cases/case-test-moveto.json";
import { effectSites } from "../../../../shared/effect-sites";
import { flagUsage, deleteFlag } from "../editor/fields/Conditions";
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
    expect(currentInteraction(o, withEnum("broken"))).toBeNull();
    expect(currentInteraction(o, withEnum("open"))?.title).toBe("Сейф открыт");
  });

  it("подпись и эффекты осмотра берутся из состояния; без своих — от предмета", () => {
    const closed = objectView(safe(), withEnum("closed"));
    expect(closed).toMatchObject({ label: "Сейф", interactive: false, interaction: null });
    expect(closed.onInteract).toEqual([]);
    const broken = objectView(safe(), withEnum("broken"));
    expect(broken.label).toBe("Сейф (сломан)");
    expect(broken.interaction).toBeNull();
    expect(broken.onInteract).toEqual([{ type: "message", text: "Замок вырван, дверца не открывается." }]);
    expect(broken.interactive).toBe(true);
  });

  it("предмет без окна и эффектов не интерактивен, пока состояние их не даёт", () => {
    const o = { label: "Дверь", interaction: null, onInteract: [], states: [{ id: "locked", when: { flags: ["l"] }, onInteract: [{ type: "message", text: "Заперто" }] }] } as unknown as LocationObject;
    const p = startProgress(base);
    expect(objectView(o, p).interactive).toBe(false);
    expect(objectView(o, { ...p, flags: ["l"] }).interactive).toBe(true);
    expect(isInteractive(o)).toBe(true);
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

  it("эффекты входа и выхода — места эффектов: попадают в «где используется» и чистятся при удалении флага", () => {
    const owners = effectSites(base).flatMap((s) => (s.owner.kind === "objectState" ? [`${s.owner.stateId}:${s.owner.phase}`] : []));
    expect(owners).toEqual(expect.arrayContaining(["open:enter", "open:exit"]));
    expect((flagUsage(base).get("test_safe_opened") ?? []).some((u) => u.where.includes("Сейф"))).toBe(true);
    const cleaned = deleteFlag(base, "test_safe_opened");
    const open = cleaned.locations.flatMap((l) => l.objects).find((o) => o.id === "dec_safe")!.states![0];
    expect(open.onEnter).toEqual([]);
  });
});

describe("дверь — предмет с состояниями (door_412 в тестовом деле)", () => {
  const door = () => base.locations.flatMap((l) => l.objects).find((o) => o.id === "door_412")!;
  it("без ключа заперта: непроходима, осмотр даёт сообщение; с ключом — проходима, не интерактивна", () => {
    const p = startProgress(base);
    const locked = objectView(door(), p, "dorm_floor");
    expect(locked.state?.id).toBe("locked");
    expect(locked.state?.solid).toBe(true);
    expect(locked.interactive).toBe(true);
    const open = objectView(door(), { ...p, flags: [...p.flags, "key_412"] }, "dorm_floor");
    expect(open.state?.id).toBe("unlocked");
    expect(open.state?.solid ?? false).toBe(false);
    expect(open.interactive).toBe(false);
  });
});

describe("анимации предмета: валидатор и тестовое дело", () => {
  it("сейф в тестовом деле: переход в open и цикл у сломанного состояния описаны и проходят валидацию", () => {
    expect(safe().transitions?.[0]).toMatchObject({ from: "*", to: "open" });
    expect(safe().states?.find((st) => st.id === "broken")?.loop?.pauseMs).toBe(1500);
    expect(validateCase(base).ok).toBe(true);
  });

  it("валидатор: нет кадра в клипе, нет состояния в переходе, «из» = «в»", () => {
    const c = structuredClone(base);
    const o = c.locations.flatMap((l) => l.objects).find((x) => x.id === "dec_safe")!;
    o.transitions = [
      { from: "nope", to: "open", clip: [{ frame: "default", ms: 100 }] },
      { from: "open", to: "open", clip: [{ frame: "ghost", ms: 100 }] },
    ];
    const r = validateCase(c);
    const text = r.ok ? "" : r.errors.join("\n");
    expect(text).toContain("нет состояния «nope»");
    expect(text).toContain("совпадают");
    expect(text).toContain("нет кадра ghost");
  });
});

describe("действия и таймеры предмета", () => {
  it("сейф в тестовом деле: действие при осмотре открытого и таймер в закрытом состоянии", () => {
    expect(safe().actions?.[0]).toMatchObject({ on: "interact", state: "open" });
    expect(safe().timers?.[0]).toMatchObject({ everyMs: 6000, state: "default" });
  });

  it("валидатор: действие и таймер с неизвестным состоянием или кадром", () => {
    const c = structuredClone(base);
    const o = c.locations.flatMap((l) => l.objects).find((x) => x.id === "dec_safe")!;
    o.actions = [{ on: "interact", state: "нет", clip: [{ frame: "ghost", ms: 100 }] }];
    o.timers = [{ everyMs: 1000, state: "тоже_нет", clip: [{ frame: "default", ms: 100 }] }];
    const r = validateCase(c);
    const text = r.ok ? "" : r.errors.join("\n");
    expect(text).toContain("действие №1: нет состояния «нет»");
    expect(text).toContain("действие №1: нет кадра ghost");
    expect(text).toContain("таймер №1: нет состояния «тоже_нет»");
  });

  it("playAnimation: в тестовом деле есть, applyEffects отдаёт followUp, валидатор ловит ошибки", () => {
    const fx = base.locations.flatMap((l) => l.objects).flatMap((o) => o.onInteract ?? []).find((e) => e.type === "playAnimation");
    expect(fx).toMatchObject({ objectId: "dec_safe" });
    const res = applyEffects([fx!], startProgress(base), { whereIs: () => undefined, counters: [], locationId: "" } as never);
    expect(res.followUp?.animations).toEqual([{ objectId: "dec_safe", clip: (fx as { clip: unknown }).clip }]);

    const c = structuredClone(base);
    const bad = c.locations.flatMap((l) => l.objects).flatMap((o) => o.onInteract ?? []).find((e) => e.type === "playAnimation") as { objectId: string; clip: { frame: string; ms: number }[] };
    bad.clip = [{ frame: "ghost", ms: 100 }];
    expect(JSON.stringify(validateCase(c))).toContain("нет кадра «ghost»");
    bad.objectId = "nope";
    expect(JSON.stringify(validateCase(c))).toContain("неизвестный предмет «nope»");
  });
});
