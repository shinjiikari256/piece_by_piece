import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateCase } from "./content/validate";
import { scoreCase } from "../../../shared/scoring";
import { actions, store } from "./state/store";
import { isSaveOutdated, listSaves, readSave } from "./state/persistence";
import type { CaseFile } from "../../../shared/case";
import { LocalAuthority } from "./content/local-authority";
import { toPublicCase } from "../../../shared/public-case";
import { RESULT_FORMAT_VERSION, finish as judgeFinish } from "../../../shared/judge";
import { listResults } from "./state/profile";
import { toResultFile } from "./state/result-file";
import { setPlatform } from "./state/platform";
import { createBrowserPlatform } from "./state/browser-platform";
import { createMemoryPlatform } from "./state/memory-platform";

const casesDir = path.resolve(__dirname, "content/cases");
const caseFiles = readdirSync(casesDir).filter((f) => f.endsWith(".json"));
const load = (file: string) => JSON.parse(readFileSync(path.join(casesDir, file), "utf8"));

describe("сценарии", () => {
  it.each(caseFiles)("%s проходит валидацию", (file) => {
    const result = validateCase(load(file));
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it("своя внешность персонажа: двойники запрещены", async () => {
    const raw = load("case-001.json");
    const custom = { skin: "#f1c7a1", hair: "#1e1a18", hairStyle: "curly", top: "#2e9e5b", accent: "#ffffff", accentStyle: "tie", legs: "#2b2f3a", shoes: "#111418", glasses: true, mustache: false, beard: true };
    raw.characters[0].appearance = custom;
    expect(validateCase(raw).ok).toBe(true);
    raw.characters[1].appearance = { ...custom };
    const r = validateCase(raw);
    expect(r.ok ? [] : r.errors.join("\n")).toMatch(/такая же внешность/);
  });

  it("валидатор ловит битые ссылки", async () => {
    const raw = load("case-001.json");
    raw.solution.responsibleCharacter = "nobody";
    raw.dialogues[0].nodes[0].choices[0].next = "missing";
    const result = validateCase(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(/nobody[\s\S]*missing|missing[\s\S]*nobody/);
  });
});

describe("оценка", () => {
  const c = validateCase(load("case-001.json"));
  if (!c.ok) throw new Error("case-001 invalid");
  const caseFile = c.caseFile;
  const perfect = {
    q_right: ["correspondence_secrecy"],
    q_violation: ["yes"],
    q_qualification: ["criminal"],
    q_responsible: ["krylov"],
    q_evidence: ["mail_log", "krylov_admission", "printout", "teacher_testimony", "alina_testimony", "key_log", "mail_policy"],
  };

  it("идеальные ответы дают 100", async () => {
    const s = scoreCase(caseFile, perfect, 0);
    expect(s.total).toBe(100);
    expect(s.groups.map((g) => [g.label, g.points, g.max])).toEqual([
      ["Определение права", 30, 30],
      ["Квалификация ситуации", 30, 30],
      ["Виновное лицо", 20, 20],
      ["Доказательства", 20, 20],
    ]);
  });

  it("составной результат: частичные баллы, штраф за ложные улики и подсказки", async () => {
    const s = scoreCase(
      caseFile,
      { ...perfect, q_right: ["privacy"], q_qualification: ["disciplinary"], q_evidence: ["mail_log", "krylov_denial"] },
      2,
    );
    // 15 + (15+7) + 20 + max(0, 5-4) − (5+7)
    expect(s.total).toBe(15 + 22 + 20 + 1 - 12);
    expect(s.hintPenalty).toBe(12);
  });

  it("баллы за вопрос не уходят в минус", async () => {
    expect(scoreCase(caseFile, { q_evidence: ["krylov_denial"] }, 0).groups[3].points).toBe(0);
  });
});

describe("прохождение дела №001", () => {
  let caseFile: CaseFile;
  const visible = () => {
    const o = store.get().overlay;
    if (o?.kind !== "dialogue") return [];
    const node = caseFile.dialogues.find((d) => d.id === o.dialogueId)!.nodes.find((n) => n.id === o.nodeId)!;
    return node.choices.filter((ch) => actions.isChoiceVisible(ch)).map((ch) => ch.id);
  };
  const talk = (npcId: string, ...choices: string[]) => {
    actions.interact(npcId);
    for (const id of choices) {
      expect(visible(), `вариант «${id}» должен быть доступен`).toContain(id);
      actions.choose(id);
    }
    actions.close();
  };
  const examine = (objectId: string) => {
    actions.interact(objectId);
    actions.addObjectToJournal(objectId);
    actions.close();
  };

  beforeEach(() => {
    setPlatform(createMemoryPlatform());
    const c = validateCase(load("case-001.json"));
    if (!c.ok) throw new Error("invalid");
    caseFile = c.caseFile;
    actions.openCase(new LocalAuthority(caseFile));
    actions.beginInvestigation();
  });

  it("можно пройти от начала до конца: 100 баллов + бонус за время", async () => {
    talk("npc_alina", "what", "back", "pass", "back");
    talk("npc_gusev", "key", "back");
    ["obj_computer", "obj_desk", "obj_cabinet", "obj_board", "obj_guard_post"].forEach(examine);
    talk("npc_lebedeva", "quote", "back");
    for (const d of caseFile.deductions) {
      expect(actions.findDeduction([...d.evidenceIds].reverse())?.id).toBe(d.id);
      const correct = d.options.find((o) => o.correct)!;
      expect((await actions.answerDeduction(d.id, correct.id))?.correct).toBe(true);
    }
    expect(store.get().progress.deductions).toHaveLength(caseFile.deductions.length);

    talk("npc_krylov", "log", "keys");
    expect(store.get().progress.collected).toContain("krylov_admission");

    actions.goFinal();
    actions.setAnswer("q_right", ["correspondence_secrecy"]);
    actions.setAnswer("q_violation", ["yes"]);
    actions.setAnswer("q_qualification", ["criminal"]);
    actions.setAnswer("q_responsible", ["krylov"]);
    actions.setAnswer("q_evidence", ["mail_log", "krylov_admission", "printout", "teacher_testimony", "alina_testimony", "key_log", "mail_policy"]);
    await actions.submit();
    expect(store.get().screen).toBe("result");
    expect(store.get().score?.total).toBe(110);
  });

  it("давление без доказательств закрывает собеседника, но факты его открывают", async () => {
    talk("npc_krylov", "press");
    actions.interact("npc_krylov");
    expect(visible()).not.toContain("role");
    expect(visible()).not.toContain("ask");
    actions.close();

    examine("obj_computer");
    examine("obj_guard_post");
    talk("npc_alina", "pass", "back");
    actions.interact("npc_krylov");
    expect(visible(), "без установленного факта журнал не предъявить").not.toContain("log");
    actions.close();
    await actions.answerDeduction("d_access", "b");
    await actions.answerDeduction("d_who", "a");
    talk("npc_krylov", "log", "keys");
    expect(store.get().progress.collected).toContain("krylov_admission");
  });

  it("заданный вопрос отмечается, повторный выбор просто снова ведёт к ответу", async () => {
    actions.interact("npc_alina");
    actions.choose("pass");
    actions.choose("back");
    expect(visible()).toContain("pass");
    expect(actions.isChoiceUsed("dlg_alina", "start", "pass")).toBe(true);

    actions.choose("pass");
    const o = store.get().overlay;
    expect(o?.kind === "dialogue" && o.nodeId).toBe("pass");
  });

  it("ложь Крылова попадает в дело как улика низкой достоверности", async () => {
    talk("npc_krylov", "ask");
    const id = "krylov_denial";
    expect(store.get().progress.collected).toContain(id);
    expect(caseFile.evidence.find((e) => e.id === id)?.reliability).toBe("low");
  });

  it("мир заблокирован, пока открыт интерфейс", async () => {
    actions.interact("obj_computer");
    actions.interact("npc_alina");
    expect(store.get().overlay).toEqual({ kind: "object", objectId: "obj_computer" });
  });

  it("неверная комбинация улик не даёт вывода", async () => {
    expect(actions.findDeduction(["key_log", "complaint_copy"])).toBeUndefined();
  });

  it("бонус за время: уложился — сверх 100, опоздал — без бонуса", async () => {
    const withBonus = { ...caseFile, timeBonus: { minutes: 15, points: 10 } };
    const perfect = {
      q_right: ["correspondence_secrecy"],
      q_violation: ["yes"],
      q_qualification: ["criminal"],
      q_responsible: ["krylov"],
      q_evidence: ["mail_log", "krylov_admission", "printout", "teacher_testimony", "alina_testimony", "key_log", "mail_policy"],
    };
    expect(scoreCase(withBonus, perfect, 0, 10 * 60_000).total).toBe(110);
    expect(scoreCase(withBonus, perfect, 0, 20 * 60_000).total).toBe(100);
    expect(scoreCase(withBonus, perfect, 0, 10 * 60_000).max).toBe(110);
  });

  it("баллов в деле может быть сколько угодно: проценты не зависят от суммы", async () => {
    const scaled = JSON.parse(JSON.stringify(caseFile)) as typeof caseFile;
    delete scaled.timeBonus;
    const k = 2.35;
    for (const q of scaled.questions) {
      q.maxPoints = Math.round(q.maxPoints * k);
      for (const o of q.options) o.points = Math.round(o.points * k);
    }
    const result = validateCase(scaled);
    expect(result.ok).toBe(true);
    const perfect = Object.fromEntries(
      scaled.questions.map((q) => [
        q.id,
        q.kind === "multi" ? q.options.filter((o) => o.points > 0).map((o) => o.id) : q.options.filter((o) => o.points === q.maxPoints).map((o) => o.id).slice(0, 1),
      ]),
    );
    const score = scoreCase(scaled, perfect, 0);
    expect(score.total).toBe(score.max);
    expect(score.max).toBeGreaterThan(200);
    const zero = JSON.parse(JSON.stringify(caseFile)) as typeof caseFile;
    for (const q of zero.questions) {
      q.maxPoints = 0;
      for (const o of q.options) o.points = 0;
    }
    const bad = validateCase(zero);
    expect(bad.ok ? "" : bad.errors.join("\n")).toMatch(/больше нуля/);
  });

  it("бонус за время — только за успешное прохождение", async () => {
    const weak = { q_right: ["correspondence_secrecy"], q_violation: ["yes"] };
    const strict = { ...caseFile, timeBonus: { minutes: 15, points: 10, minScore: 75 } };
    const lowScore = scoreCase(strict, weak, 0, 5 * 60_000);
    expect(lowScore.timeBonus?.points).toBe(0);
    expect(lowScore.timeBonus?.missed).toBe("score");
    const lenient = { ...caseFile, timeBonus: { minutes: 15, points: 10, minScore: 0 } };
    expect(scoreCase(lenient, weak, 0, 5 * 60_000).timeBonus?.points).toBe(10);
    // порог не задан — как 0: бонус при любом результате выше нуля, но не при нуле
    const unset = { ...caseFile, timeBonus: { minutes: 15, points: 10 } };
    expect(scoreCase(unset, weak, 0, 5 * 60_000).timeBonus?.points).toBe(10);
    expect(scoreCase(unset, {}, 0, 5 * 60_000).timeBonus).toMatchObject({ points: 0, missed: "score" });
    // порог — в баллах после штрафа за подсказки: 45 баллов за ответы при пороге 45 — бонус есть, с подсказкой (−5) — нет
    const exact = { ...caseFile, timeBonus: { minutes: 15, points: 10, minScore: 45 } };
    expect(scoreCase(exact, weak, 0, 5 * 60_000).timeBonus?.points).toBe(10);
    expect(scoreCase(exact, weak, 1, 5 * 60_000).timeBonus).toMatchObject({ points: 0, missed: "score", minScore: 45 });
    const r = validateCase({ ...JSON.parse(JSON.stringify(caseFile)), timeBonus: { minutes: 15, points: 10, minScore: 101 } });
    expect(r.ok ? "" : r.errors.join("\n")).toMatch(/бонус недостижим/);
  });
});

describe("прохождение дела №002", () => {
  let caseFile: CaseFile;
  const talk = (npcId: string, ...choices: string[]) => {
    actions.interact(npcId);
    choices.forEach((id) => actions.choose(id));
    actions.close();
  };
  const examine = (objectId: string) => {
    actions.interact(objectId);
    actions.addObjectToJournal(objectId);
    actions.close();
  };

  beforeEach(() => {
    setPlatform(createMemoryPlatform());
    const c = validateCase(load("case-002.json"));
    if (!c.ok) throw new Error("invalid");
    caseFile = c.caseFile;
    actions.openCase(new LocalAuthority(caseFile));
    actions.beginInvestigation();
  });

  it("можно пройти от начала до конца: 100 баллов + бонус за время", async () => {
    talk("npc_timur", "when", "back");
    talk("npc_denis", "saw", "back");
    talk("npc_ryabov", "key", "back");
    ["obj_vakhta", "obj_zuev_desk", "obj_cabinet", "obj_computer", "obj_board"].forEach(examine);
    talk("npc_zuev", "ask", "back");
    for (const d of caseFile.deductions) {
      expect(actions.findDeduction(d.evidenceIds)?.id).toBe(d.id);
      expect((await actions.answerDeduction(d.id, d.options.find((o) => o.correct)!.id))?.correct).toBe(true);
    }
    talk("npc_zuev", "repair", "witness");
    expect(store.get().progress.collected).toContain("zuev_admission");

    actions.goFinal();
    actions.setAnswer("q_right", ["home_inviolability"]);
    actions.setAnswer("q_violation", ["yes"]);
    actions.setAnswer("q_qualification", ["criminal_3"]);
    actions.setAnswer("q_responsible", ["zuev"]);
    actions.setAnswer("q_evidence", ["vakhta_log", "inspection_act", "denis_testimony", "zuev_admission", "repair_log", "timur_testimony", "dorm_rules"]);
    await actions.submit();
    expect(store.get().score?.total).toBe(110);
  });

  it("признание можно получить и через акт и распоряжение", async () => {
    examine("obj_zuev_desk");
    examine("obj_computer");
    examine("obj_board");
    await actions.answerDeduction("d_procedure", "b");
    await actions.answerDeduction("d_motive", "b");
    talk("npc_zuev", "act", "memo");
    expect(store.get().progress.collected).toContain("zuev_admission");
  });
});

describe("судья: игра не видит ответов", () => {
  it.each(caseFiles)("%s: в публичном деле нет ответов", (file) => {
    const c = validateCase(load(file));
    if (!c.ok) throw new Error("invalid");
    const pub = toPublicCase(c.caseFile);
    // баллы бонуса за время игрок видит — их не проверяем
    const json = JSON.stringify({ ...pub, timeBonus: undefined });
    for (const key of ["solution", "correct", "points", "feedback", "conclusion", "topic"]) expect(json).not.toContain(`"${key}"`);
    for (const h of c.caseFile.hints) expect(json).not.toContain(h.text);
    // а всё, что нужно для игры, на месте
    expect(pub.deductions.map((d) => d.options.length)).toEqual(c.caseFile.deductions.map((d) => d.options.length));
    expect(pub.hints.map((h) => h.penalty)).toEqual(c.caseFile.hints.map((h) => h.penalty));
  });

  it("в сторе игры — только публичное дело; подсказки и выводы приходят от судьи", async () => {
    const c = validateCase(load("case-001.json"));
    if (!c.ok) throw new Error("invalid");
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    expect(JSON.stringify(store.get().caseFile)).not.toContain('"solution"');

    await actions.revealHint();
    await actions.revealHint();
    expect(store.get().hintsUsed).toBe(2);
    expect(store.get().hints.map((h) => h.level)).toEqual([1, 2]);

    const wrong = await actions.answerDeduction("d_access", "a");
    expect(wrong?.correct).toBe(false);
    expect(wrong?.conclusion).toBeUndefined();
    expect(store.get().wrongDeductions).toBe(1);
  });
});

describe("сохранение расследования", () => {
  const memory = new Map<string, string>();
  const fakeStorage = {
    get length() {
      return memory.size;
    },
    key: (i: number) => [...memory.keys()][i] ?? null,
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  };
  let caseFile: CaseFile;

  beforeEach(() => {
    memory.clear();
    Object.assign(globalThis, { localStorage: fakeStorage });
    setPlatform(createBrowserPlatform());
    const c = validateCase(load("case-001.json"));
    if (!c.ok) throw new Error("invalid");
    caseFile = c.caseFile;
    actions.openCase(new LocalAuthority(caseFile));
    actions.beginInvestigation();
  });

  const progressNow = () => store.get().progress.collected;

  it("прогресс сохраняется и восстанавливается", async () => {
    actions.interact("obj_computer");
    actions.addObjectToJournal("obj_computer");
    actions.close();
    actions.setNotes("проверить ключи");
    actions.exitToMenu(true);
    expect(store.get().screen).toBe("menu");
    expect(listSaves().map((s) => s.caseId)).toEqual(["case-001"]);

    await actions.resume(new LocalAuthority(caseFile));
    expect(store.get().screen).toBe("play");
    expect(progressNow()).toEqual(["mail_log"]);
    expect(store.get().playerNotes).toBe("проверить ключи");
  });

  it("переполненное хранилище: игра продолжается, игрока предупреждают один раз", async () => {
    const real = fakeStorage.setItem;
    fakeStorage.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    try {
      actions.interact("obj_computer");
      actions.addObjectToJournal("obj_computer");
      actions.interact("obj_desk");
      actions.addObjectToJournal("obj_desk");
      await Promise.resolve(); // платформа сообщает о неудачной записи асинхронно
      const warnings = store.get().toasts.filter((t) => t.text.startsWith("Прогресс не сохраняется"));
      expect(warnings).toHaveLength(1);
      expect(progressNow()).toContain("mail_log");
    } finally {
      fakeStorage.setItem = real;
    }
  });

  it("выход без сохранения сбрасывает расследование", async () => {
    actions.interact("obj_computer");
    actions.addObjectToJournal("obj_computer");
    actions.exitToMenu(false);
    expect(readSave("case-001")).toBeNull();
  });

  it("новое расследование стирает старое сохранение, завершённое — тоже", async () => {
    actions.interact("obj_computer");
    actions.addObjectToJournal("obj_computer");
    actions.close();
    actions.openCase(new LocalAuthority(caseFile));
    actions.beginInvestigation();
    expect(readSave("case-001")?.progress.collected ?? []).toEqual([]);

    actions.goFinal();
    await actions.submit();
    expect(readSave("case-001")).toBeNull();
  });

  it("сохранение помнит версию дела; от другой версии — не загружается", async () => {
    actions.interact("obj_computer");
    actions.addObjectToJournal("obj_computer");
    actions.close();
    expect(readSave("case-001")?.caseUpdatedAt).toBe(caseFile.updatedAt);
    actions.exitToMenu(true);

    const updated = { ...caseFile, updatedAt: "2099-01-01T00:00:00Z" };
    const save = readSave("case-001")!;
    expect(isSaveOutdated(save, updated)).toBe(true);
    await actions.resume(new LocalAuthority(updated));
    expect(store.get().screen).toBe("intro");
    expect(progressNow()).toEqual([]);
    // сохранение не стёрто молча — его сбрасывает игрок после предупреждения
    expect(readSave("case-001")).not.toBeNull();
  });

  it("при продолжении судья возвращает выводы установленных фактов и открытые подсказки", async () => {
    await actions.answerDeduction("d_access", "b");
    await actions.revealHint();
    const conclusion = store.get().conclusions.d_access;
    expect(conclusion).toBeTruthy();
    actions.exitToMenu(true);
    expect(store.get().conclusions).toEqual({});

    await actions.resume(new LocalAuthority(caseFile));
    expect(store.get().conclusions).toEqual({ d_access: conclusion });
    expect(store.get().hints.map((h) => h.level)).toEqual([1]);
    expect(store.get().hints[0].text).toBe(caseFile.hints.find((h) => h.level === 1)!.text);
  });

    it("результат хранит версию дела, игры и формата; файл результата пересчитывается по input", async () => {
    actions.goFinal();
    actions.setAnswer("q_right", ["correspondence_secrecy"]);
    await actions.submit();
    const record = store.get().record!;
    expect(record.caseConfigVersion).toBe(caseFile.updatedAt);
    expect(record.gameVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(record.resultFormatVersion).toBe(RESULT_FORMAT_VERSION);
    expect(listResults()[0].input?.answers.q_right).toEqual(["correspondence_secrecy"]);

    const file = JSON.parse(JSON.stringify(toResultFile(record, { name: "Иванова А. С.", group: "ЮР-201" })));
    expect(file.player.name).toBe("Иванова А. С.");
    // портал пересчитает тот же итог из файла
    expect(judgeFinish(caseFile, file.input).score.total).toBe(record.total);
  });

    it("ссылки на исчезнувшие из дела улики выбрасываются", async () => {
    actions.interact("obj_computer");
    actions.addObjectToJournal("obj_computer");
    const save = readSave("case-001")!;
    memory.set("pokusochkam:save:case-001", JSON.stringify({ ...save, progress: { ...save.progress, collected: ["mail_log", "deleted"] } }));
    await actions.resume(new LocalAuthority(caseFile));
    expect(progressNow()).toEqual(["mail_log"]);
  });
});

describe("очные ставки и локации", () => {
  const start = (file: string) => {
    const c = validateCase(load(file));
    if (!c.ok) throw new Error("invalid");
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    return c.caseFile;
  };
  const say = (npcId: string, ...choices: string[]) => {
    actions.interact(npcId);
    choices.forEach((id) => actions.choose(id));
    if (store.get().overlay) actions.close();
  };
  const dialogueId = () => {
    const o = store.get().overlay;
    return o?.kind === "dialogue" ? o.dialogueId : null;
  };

  it("Лебедева идёт следом, и при ней Крылов признаётся", async () => {
    start("case-001.json");
    say("npc_alina", "what", "back");
    say("npc_lebedeva", "quote", "back", "come", "go");
    expect(store.get().progress.followers).toEqual(["lebedeva"]);

    actions.interact("npc_krylov");
    expect(dialogueId()).toBe("dlg_conf_krylov_lebedeva");
    ["look", "ask", "wait", "end"].forEach((id) => actions.choose(id));
    expect(store.get().progress.collected).toContain("krylov_admission");
    expect(store.get().progress.followers).toEqual([]);

    // второй раз очная ставка не повторяется
    say("npc_lebedeva", "come");
    expect(store.get().progress.followers).toEqual([]);
  });

  it("неудачная очная ставка: Лебедева обижается и больше не пойдёт", async () => {
    start("case-001.json");
    say("npc_alina", "what", "back");
    say("npc_lebedeva", "quote", "back", "come", "go");
    actions.interact("npc_krylov");
    ["look", "both", "end"].forEach((id) => actions.choose(id));
    expect(store.get().progress.flags).toContain("lebedeva_offended");
    expect(store.get().progress.collected).not.toContain("krylov_admission");
    actions.interact("npc_krylov");
    expect(dialogueId()).toBe("dlg_krylov");
  });

  it("без сопровождающего с Крыловым обычный разговор", async () => {
    start("case-001.json");
    actions.interact("npc_krylov");
    expect(dialogueId()).toBe("dlg_krylov");
  });

  it("Денис при коменданте: сомнение дознавателя пугает свидетеля", async () => {
    start("case-002.json");
    say("npc_denis", "saw", "back", "come", "go");
    actions.interact("npc_zuev");
    expect(dialogueId()).toBe("dlg_conf_zuev_denis");
    ["tell", "doubt", "end"].forEach((id) => actions.choose(id));
    expect(store.get().progress.flags).toContain("denis_scared");
    expect(store.get().progress.followers).toEqual([]);
  });

  it("переход по лестнице меняет локацию", async () => {
    const c = start("case-002.json");
    expect(store.get().locationId).toBe("dorm_floor");
    const zone = c.locations[0].zones.find((z) => z.actions.some((a) => a.kind === "exit"))!;
    actions.interact(`zone:${zone.id}`); // выход — область с действием «exit»
    expect(store.get().locationId).toBe("dorm_lobby");
    expect(store.get().spawn).toEqual({ x: 2, y: 12 });
  });
});

describe("ядро игры на платформе в памяти", () => {
  let caseFile: CaseFile;
  let mem: ReturnType<typeof createMemoryPlatform>;
  const open = async (deliver = true) => {
    mem = createMemoryPlatform({ deliver });
    setPlatform(mem);
    const c = validateCase(load("case-001.json"));
    if (!c.ok) throw new Error("invalid");
    caseFile = c.caseFile;
    actions.openCase(new LocalAuthority(caseFile));
    actions.beginInvestigation();
  };

  it("прогресс пишется на платформу и восстанавливается с ней, позиция игрока — тоже", async () => {
    await open();
    actions.interact("obj_computer");
    actions.addObjectToJournal("obj_computer");
    actions.close();
    expect(mem.data.saves.get("case-001")?.progress.collected).toContain("mail_log");
    actions.rememberPlayer({ x: 3, y: 4, locationId: caseFile.locations[0].id });
    await mem.saves.savePlayerPosition("case-001", { x: 3, y: 4, locationId: caseFile.locations[0].id });
    actions.exitToMenu(true);
    expect(mem.data.saves.get("case-001")?.pausedAt).toBeTypeOf("number");
    await actions.resume(new LocalAuthority(caseFile));
    expect(store.get().progress.collected).toContain("mail_log");
    expect(store.get().savedPlayer).toEqual({ x: 3, y: 4, locationId: caseFile.locations[0].id });
  });

  it("новое расследование стирает сохранение на платформе", async () => {
    await open();
    actions.interact("obj_computer");
    actions.addObjectToJournal("obj_computer");
    expect(mem.data.saves.has("case-001")).toBe(true);
    actions.beginInvestigation();
    expect(mem.data.saves.has("case-001")).toBe(false);
  });

  it("результат, не дошедший по назначению, — тост; доставленный — нет", async () => {
    for (const deliver of [false, true]) {
      await open(deliver);
      await actions.submit(); // ответы пустые — итог считает судья, результат всё равно записывается
      await Promise.resolve();
      expect(mem.data.results).toHaveLength(1);
      expect(store.get().toasts.some((t) => t.text.includes("не удалось отправить"))).toBe(!deliver);
    }
  });
});

describe("спутники: отвязка", () => {
  const startWithZone = () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "never", name: "Никогда" }];
    raw.locations[0].zones.push({
      id: "z_wait",
      name: "Закрытая",
      cells: [{ x: 1, y: 1 }],
      actions: [{ kind: "effects", effects: [], requires: { flags: ["never"] } }],
    } as never);
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    actions.interact("npc_alina");
    ["what", "back"].forEach((id) => actions.choose(id));
    actions.close();
    actions.interact("npc_lebedeva");
    ["quote", "back", "come", "go"].forEach((id) => actions.choose(id));
    actions.close();
  };
  beforeEach(() => {
    setPlatform(createMemoryPlatform());
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("вручную: releaseFollowers отвязывает всех", () => {
    startWithZone();
    expect(store.get().progress.followers).toEqual(["lebedeva"]);
    actions.releaseFollowers();
    expect(store.get().progress.followers).toEqual([]);
  });

  it("в области без подходящего действия спутник уходит через 3 секунды", () => {
    startWithZone();
    actions.enterZone("z_wait");
    vi.advanceTimersByTime(2900);
    expect(store.get().progress.followers).toEqual(["lebedeva"]);
    vi.advanceTimersByTime(200);
    expect(store.get().progress.followers).toEqual([]);
  });

  it("вышел из области до истечения 3 секунд — спутник остаётся", () => {
    startWithZone();
    actions.enterZone("z_wait");
    vi.advanceTimersByTime(1500);
    actions.leaveZone("z_wait");
    vi.advanceTimersByTime(5000);
    expect(store.get().progress.followers).toEqual(["lebedeva"]);
  });
});

describe("moveTo с областью", () => {
  it("персонаж встаёт на свободную клетку области; занятую пропускает", () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    const loc = raw.locations[0];
    const start = loc.playerStart!;
    const other = loc.npcs.find((n) => n.characterId !== "krylov")!;
    loc.zones.push({
      id: "z_goal",
      name: "Цель",
      // первая клетка занята другим человеком — берётся вторая
      cells: [{ x: other.x, y: other.y }, { x: start.x, y: start.y }],
      actions: [{ kind: "effects", auto: true, effects: [{ type: "moveTo", characterId: "krylov", locationId: loc.id, x: 0, y: 0, zoneId: "z_goal" }] }],
    } as never);
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    actions.enterZone("z_goal");
    expect(store.get().progress.npcPlaces.krylov).toMatchObject({ locationId: loc.id, x: start.x, y: start.y });
  });
});

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

describe("эффекты осмотра предмета", () => {
  it("срабатывают при первом осмотре, повторно — нет", () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "seen_pc", name: "Компьютер осмотрен" }];
    raw.counters = [{ id: "looks", name: "Осмотры" }];
    const obj = raw.locations.flatMap((l) => l.objects).find((o) => o.id === "obj_computer")!;
    obj.interaction!.effects = [
      { type: "changeVariable", variableId: "seen_pc", action: "on" },
      { type: "changeVariable", variableId: "looks", action: "add", value: 1 },
    ];
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

describe("эффекты варианта ответа", () => {
  it("применяются при каждом выборе, до ответа персонажа", () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "asked", name: "Спросили" }];
    raw.counters = [{ id: "asks", name: "Вопросы" }];
    const dlg = raw.dialogues.find((d) => d.id === "dlg_alina")!;
    const choice = dlg.nodes.find((n) => n.id === "start")!.choices.find((c) => c.id === "pass")!;
    choice.effects = [
      { type: "changeVariable", variableId: "asked", action: "on" },
      { type: "changeVariable", variableId: "asks", action: "add", value: 1 },
    ];
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    actions.interact("npc_alina");
    expect(store.get().progress.flags).not.toContain("asked");
    actions.choose("pass");
    actions.choose("back");
    actions.choose("pass");
    expect(store.get().progress.flags).toContain("asked");
    expect(store.get().progress.counters.asks).toBe(2);
  });
});
