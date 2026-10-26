import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateCase } from "./content/validate";
import { actions, store } from "./state/store";
import testCaseJson from "./content/test-cases/case-test-moveto.json";
import { objectEvidenceIds, type CaseFile, type Effect } from "../../../shared/case";
import { LocalAuthority } from "./content/local-authority";
import { platform, setPlatform } from "./state/platform";
import { createMemoryPlatform } from "./state/memory-platform";

const casesDir = path.resolve(__dirname, "content/cases");
const load = (file: string) => JSON.parse(readFileSync(path.join(casesDir, file), "utf8"));

describe("начальные флаги и счётчики в игре", () => {
  it("расследование начинается с отмеченными флагами и начальными значениями счётчиков", () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "ready", name: "Готово", initial: true }];
    raw.counters = [{ id: "trust", name: "Доверие", initial: 3 }];
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    expect(store.get().progress.flags).toContain("ready");
    expect(store.get().progress.counters).toEqual({ trust: 3 });
  });
});

describe("эффекты осмотра предмета (onInteract)", () => {
  it("срабатывают при первом осмотре, повторно — нет", () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "seen_pc", name: "Компьютер осмотрен" }];
    raw.counters = [{ id: "looks", name: "Осмотры" }];
    const obj = raw.locations.flatMap((l) => l.objects).find((o) => o.id === "obj_computer")!;
    obj.onInteract = [...obj.onInteract, { type: "changeVariable", variableId: "seen_pc", action: "on" }, { type: "changeVariable", variableId: "looks", action: "add", value: 1, once: true }];
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    actions.interact("obj_computer");
    actions.close();
    actions.interact("obj_computer");
    actions.close();
    expect(store.get().progress.flags).toContain("seen_pc");
    expect(store.get().progress.counters.looks).toBe(1);
  });
});

describe("события: вход в локацию, получение улики, ошибка сопоставления", () => {
  const start = (mutate: (c: CaseFile) => void) => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "entered", name: "Вошли" }];
    raw.counters = [{ id: "n", name: "Счёт" }];
    mutate(raw);
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
  };
  const inc: Effect = { type: "changeVariable", variableId: "n", action: "add", value: 1 };

  it("onEnter: срабатывает при каждом входе, эффект с once — только при первом", () => {
    start((c) => (c.locations[0].onEnter = [inc]));
    expect(store.get().progress.counters.n).toBe(1); // старт — тоже вход
    actions.travel({ to: "admin_building", spawn: { x: 1, y: 1 } });
    expect(store.get().progress.counters.n).toBe(2);

    start((c) => (c.locations[0].onEnter = [{ ...inc, once: true }, inc]));
    actions.travel({ to: "admin_building", spawn: { x: 1, y: 1 } });
    // вход при старте: оба; повторный вход: только эффект без once
    expect(store.get().progress.counters.n).toBe(3);
  });

  it("onCollect: эффекты улики срабатывают сразу после её выдачи, один раз", () => {
    const obj = (load("case-001.json") as unknown as CaseFile).locations.flatMap((l) => l.objects).find((o) => o.id === "obj_computer")!;
    const ev = objectEvidenceIds(obj)[0];
    start((c) => (c.evidence.find((e) => e.id === ev)!.onCollect = [{ type: "changeVariable", variableId: "entered", action: "on" }, inc]));
    expect(store.get().progress.flags).not.toContain("entered");
    actions.interact("obj_computer");
    actions.close();
    expect(store.get().progress.flags).toContain("entered");
    expect(store.get().progress.counters.n).toBe(1);
    actions.interact("obj_computer");
    actions.close();
    expect(store.get().progress.counters.n).toBe(1);
  });

  it("failEffects: срабатывают при каждом неверном ответе", async () => {
    start((c) => (c.deductions.find((d) => d.id === "d_access")!.failEffects = [inc]));
    await actions.answerDeduction("d_access", "a");
    await actions.answerDeduction("d_access", "c");
    expect(store.get().progress.counters.n).toBe(2);
    await actions.answerDeduction("d_access", "b");
    expect(store.get().progress.counters.n).toBe(2);
  });
});

describe("осмотр без окна и повторные эффекты", () => {
  const start = (mutate: (c: CaseFile) => void) => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.counters = [{ id: "n", name: "Счёт" }];
    mutate(raw);
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
  };
  const inc: Effect = { type: "changeVariable", variableId: "n", action: "add", value: 1 };
  const computer = (c: CaseFile) => c.locations.flatMap((l) => l.objects).find((o) => o.id === "obj_computer")!;

  it("эффекты осмотра срабатывают при каждом осмотре, once — только при первом", () => {
    start((c) => (computer(c).onInteract = [...computer(c).onInteract, inc, { ...inc, once: true }]));
    for (let i = 0; i < 3; i++) {
      actions.interact("obj_computer");
      actions.close();
    }
    expect(store.get().progress.counters.n).toBe(4); // 3 раза обычный + 1 раз once
  });

  it("предмет без окна осмотра (interaction: null) срабатывает молча, один раз", () => {
    start((c) => {
      const ev = objectEvidenceIds(computer(c))[0];
      computer(c).interaction = null;
      // улика теперь выдаётся эффектом, иначе она недостижима
      computer(c).onInteract = [
        { type: "addEvidence", evidenceId: ev },
        { ...inc, once: true },
        { type: "message", text: "Щёлк", once: true },
      ];
    });
    actions.interact("obj_computer");
    expect(store.get().overlay).toBeNull();
    expect(store.get().progress.counters.n).toBe(1);
    expect(store.get().toasts.map((t) => t.text)).toContain("Щёлк");
    actions.interact("obj_computer");
    expect(store.get().progress.counters.n).toBe(1);
  });

  it("осмотр без улики: окно с текстом, материал в дело не попадает", () => {
    start((c) => {
      const ev = objectEvidenceIds(computer(c))[0];
      computer(c).interaction = { title: "Экран", description: "Просто экран" };
      // улику выдаёт другой источник — эффект предмета с условием «никогда»
      computer(c).onInteract = [{ type: "addEvidence", evidenceId: ev, requires: { flags: ["never"] } }];
      c.flags = [...(c.flags ?? []), { id: "never", name: "Никогда" }];
    });
    actions.interact("obj_computer");
    expect(store.get().overlay).toMatchObject({ kind: "object" });
    expect(store.get().progress.collected).not.toContain("mail_log");
  });
});

describe("эффекты: startDialogue, travel, removeEvidence в игре", () => {
  const start = (mutate: (c: CaseFile) => void) => {
    const raw = load("case-001.json") as unknown as CaseFile;
    mutate(raw);
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
  };

  it("эффект варианта запускает другой диалог вместо обычного перехода", () => {
    start((c) => {
      const alina = c.dialogues.find((d) => d.id === "dlg_alina")!;
      const other = c.dialogues.find((d) => d.id !== "dlg_alina")!;
      alina.nodes.find((n) => n.id === "start")!.choices.find((ch) => ch.id === "pass")!.effects = [{ type: "startDialogue", dialogueId: other.id }];
    });
    actions.interact("npc_alina");
    actions.choose("pass");
    const o = store.get().overlay;
    expect(o?.kind === "dialogue" && o.dialogueId).not.toBe("dlg_alina");
  });

  it("removeEvidence убирает улику из дела и показывает сообщение", () => {
    start((c) => {
      const ev = c.locations
        .flatMap((l) => l.objects)
        .find((o) => o.id === "obj_computer")!
        .onInteract.flatMap((e) => (e.type === "addEvidence" ? [e.evidenceId] : []))[0];
      c.dialogues
        .find((d) => d.id === "dlg_alina")!
        .nodes.find((n) => n.id === "start")!
        .choices.find((ch) => ch.id === "pass")!.effects = [{ type: "removeEvidence", evidenceId: ev }];
      // сопоставление на этой улике запретило бы убирать её — берём улику, которой нет в сопоставлениях
      c.deductions.forEach((d) => (d.evidenceIds = d.evidenceIds.map((id) => (id === ev ? c.evidence.find((e) => e.id !== ev && !d.evidenceIds.includes(e.id))!.id : id))));
    });
    actions.interact("obj_computer");
    actions.close();
    const ev = store.get().progress.collected.find((id) => id === "mail_log") ?? store.get().progress.collected[0];
    expect(store.get().progress.collected).toContain(ev);
    actions.interact("npc_alina");
    actions.choose("pass");
    expect(store.get().progress.collected).not.toContain(ev);
    expect(store.get().toasts.some((t) => t.text.startsWith("Из дела убрано"))).toBe(true);
  });

  it("travel переносит игрока и запускает вход в локацию", () => {
    start((c) => {
      c.dialogues
        .find((d) => d.id === "dlg_alina")!
        .nodes.find((n) => n.id === "start")!
        .choices.find((ch) => ch.id === "pass")!.effects = [{ type: "travel", locationId: "admin_building", x: 5, y: 5 }];
    });
    actions.interact("npc_alina");
    actions.choose("pass");
    expect(store.get().spawn).toEqual({ x: 5, y: 5 });
  });
});

describe("эффект failCase", () => {
  it("показывает окно «Дело провалено», стирает сохранение, не пишет результат; «заново» начинает дело сначала", async () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.counters = [{ id: "n", name: "Счёт" }];
    raw.dialogues
      .find((d) => d.id === "dlg_alina")!
      .nodes.find((n) => n.id === "start")!
      .choices.find((c) => c.id === "pass")!.effects = [
      { type: "changeVariable", variableId: "n", action: "add", value: 1 },
      { type: "failCase", text: "Вас поймали" },
    ];
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    actions.interact("npc_alina");
    actions.choose("pass");
    expect(store.get().overlay).toEqual({ kind: "failed", text: "Вас поймали" });
    expect(await platform().results.list()).toHaveLength(0);
    actions.restartAfterFail();
    expect(store.get().overlay).toBeNull();
    expect(store.get().progress.counters.n).toBeUndefined();
  });
});

describe("осмотр предмета с несколькими уликами", () => {
  it("окно получает список только что выданных улик; повторный осмотр — пустой список", () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    const computer = raw.locations.flatMap((l) => l.objects).find((o) => o.id === "obj_computer")!;
    const extra = raw.evidence.find((e) => !objectEvidenceIds(computer).includes(e.id) && !raw.locations.flatMap((l) => l.objects).some((o) => objectEvidenceIds(o).includes(e.id)));
    // вторая улика у того же предмета: берём любую, которую выдаёт только диалог — она станет доступна и через предмет
    const second = extra ?? raw.evidence.find((e) => !objectEvidenceIds(computer).includes(e.id))!;
    computer.onInteract = [...computer.onInteract, { type: "addEvidence", evidenceId: second.id }];
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    actions.interact("obj_computer");
    const first = store.get().overlay;
    expect(first?.kind === "object" && [...(first.gained ?? [])].sort()).toEqual([...objectEvidenceIds(computer)].sort());
    expect(first?.kind === "object" && first.gained).toContain(second.id);
    actions.close();
    actions.interact("obj_computer");
    const again = store.get().overlay;
    expect(again?.kind === "object" && again.gained).toEqual([]);
  });
});

describe("события состояний предмета (сейф в тестовом деле)", () => {
  const start = (initialSafe?: string) => {
    const raw = structuredClone(testCaseJson) as unknown as CaseFile;
    if (initialSafe) raw.enums!.find((e) => e.id === "test_safe")!.initial = initialSafe;
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
  };
  const toasts = () => store.get().toasts.map((t) => t.text);

  it("вход в состояние срабатывает при живой смене, выход — при уходе из него", () => {
    start();
    actions.interact("npc_timur");
    actions.choose("n_menu");
    expect(store.get().progress.flags).not.toContain("test_safe_opened");
    actions.choose("n2a"); // закрыт → открыт
    expect(store.get().progress.flags).toContain("test_safe_opened");
    expect(toasts()).not.toContain("Дверца сейфа захлопнулась.");
    actions.choose("n2c"); // открыт → закрыт
    expect(toasts()).toContain("Дверца сейфа захлопнулась.");
  });

  it("предъявление материала: первое подходящее, иначе собеседник не реагирует", () => {
    start();
    actions.interact("npc_timur");
    actions.choose("n_menu");
    actions.present("inspection_act"); // акт ещё не собран
    expect(store.get().progress.counters.test_score ?? 0).toBe(0);
    store.get().progress.collected.push("inspection_act", "memo");
    actions.present("inspection_act");
    expect(toasts()).toContain("Тимур вздрогнул при виде акта");
    expect(store.get().progress.counters.test_score).toBe(5);
    actions.present("inspection_act");
    expect(store.get().progress.counters.test_score).toBe(5); // разовый эффект не повторился
    actions.present("memo");
    expect(toasts()).toContain("Тимур пожал плечами");
    expect(store.get().overlay).toMatchObject({ kind: "dialogue", nodeId: "n_menu" });
  });

  it("сейф «сломан» — переход без эффектов: флаг не ставится", () => {
    start();
    actions.interact("npc_timur");
    actions.choose("n_menu");
    actions.choose("n2b");
    expect(store.get().progress.flags).not.toContain("test_safe_opened");
  });

  it("осмотр сломанного сейфа: эффекты состояния вместо окна — сообщение", () => {
    start();
    actions.interact("npc_timur");
    actions.choose("n_menu");
    actions.choose("n2b");
    actions.close();
    actions.interact("dec_safe");
    expect(store.get().overlay).toBeNull();
    expect(toasts()).toContain("Замок вырван, дверца не открывается.");
  });

  it("осмотр открытого сейфа открывает окно с текстом состояния", () => {
    start();
    actions.interact("npc_timur");
    actions.choose("n_menu");
    actions.choose("n2a");
    actions.close();
    actions.interact("dec_safe");
    expect(store.get().overlay).toMatchObject({ kind: "object", objectId: "dec_safe" });
  });

  it("начальное состояние (старт дела, загрузка) эффектов не запускает", () => {
    start("open");
    expect(store.get().progress.enums.test_safe).toBe("open");
    expect(store.get().progress.flags).not.toContain("test_safe_opened");
  });
});

describe("тестовое дело: ветка «Новые возможности»", () => {
  it("сценарии 1–4 и 7 проходятся: эффекты варианта, сейф, ключ, составное условие, провал", () => {
    const c = validateCase(structuredClone(testCaseJson) as unknown as CaseFile);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    const p = () => store.get().progress;
    actions.interact("npc_timur");
    actions.choose("n_menu");
    // 1. разовые очки, бонус по условию, границы счётчика
    actions.choose("n1");
    expect(p().counters.test_score).toBe(1);
    actions.choose("n1");
    expect(p().counters.test_score).toBe(11); // разовый +1 не повторился, +10 по флагу сработал
    actions.choose("n1a");
    actions.choose("n1a");
    expect(p().counters.test_hp).toBe(0);
    actions.choose("n1b");
    actions.choose("n1b");
    actions.choose("n1b");
    expect(p().counters.test_hp).toBe(5);
    // 2. сейф
    expect(actions.isChoiceVisible({ requires: { enums: [{ enumId: "test_safe", in: ["open"] }] } })).toBe(false);
    actions.choose("n2a");
    expect(p().enums.test_safe).toBe("open");
    actions.choose("n2d");
    expect(store.get().overlay).toMatchObject({ nodeId: "n_safe" });
    actions.choose("n_safe_back");
    expect(p().enums.test_safe).toBe("closed");
    // 3. ключ: предмет в деле, но не улика; расходуется
    actions.choose("n3a");
    expect(p().collected).toContain("test_key");
    actions.choose("n3b");
    expect(p().collected).not.toContain("test_key");
    // 4. составное условие: вариант 1 уже выбирался и вне вестибюля, нужен флаг A или ключ
    const compound = c.caseFile.dialogues
      .find((d) => d.id === "dlg_timur")!
      .nodes.find((n) => n.id === "n_menu")!
      .choices.find((x) => x.id === "n4")!;
    expect(actions.isChoiceVisible(compound)).toBe(false);
    actions.choose("n4a");
    expect(actions.isChoiceVisible(compound)).toBe(true);
    // 7. провал дела
    actions.choose("n7c");
    expect(store.get().overlay).toMatchObject({ kind: "failed" });
  });
});

describe("условия доступности у подсказок и сопоставлений", () => {
  const open = (patch: (c: CaseFile) => void) => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "ready", name: "Готов" }];
    patch(raw);
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
  };
  const gate = (c: CaseFile) => {
    c.hints.sort((a, b) => a.level - b.level)[0].requires = { flags: ["ready"] };
    c.deductions.find((d) => d.id === "d_who")!.requires = { flags: ["ready"] };
  };

  it("пока условие не выполнено: подсказку не открыть, материалы не связываются", async () => {
    open(gate);
    await actions.revealHint();
    expect(store.get().hintsUsed).toBe(0);
    expect(actions.findDeduction(["mail_log", "key_log"])).toBeUndefined();
    expect(actions.findDeduction(["mail_log", "alina_testimony"])?.id).toBe("d_access"); // без условия — как раньше
  });

  it("условие выполнено (флаг стоит с начала): подсказка открывается, сопоставление находится", async () => {
    open((c) => {
      gate(c);
      c.flags!.find((f) => f.id === "ready")!.initial = true;
    });
    await actions.revealHint();
    expect(store.get().hintsUsed).toBe(1);
    expect(actions.findDeduction(["mail_log", "key_log"])?.id).toBe("d_who");
  });
});
