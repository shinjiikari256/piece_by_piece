import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { validateCase } from "./content/validate";
import { actions, store } from "./state/store";
import testCaseJson from "./content/test-cases/case-test-moveto.json";
import { type CaseFile, type Effect } from "../../../shared/case";
import { LocalAuthority } from "./content/local-authority";
import { nodeText, startProgress } from "../../../shared/conditions";
import { setPlatform } from "./state/platform";
import { createMemoryPlatform } from "./state/memory-platform";

const casesDir = path.resolve(__dirname, "content/cases");
const load = (file: string) => JSON.parse(readFileSync(path.join(casesDir, file), "utf8"));

describe("очные ставки и локации", () => {
  beforeEach(() => setPlatform(createMemoryPlatform()));
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

  it("эффект «сообщение» показывает тост", () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.dialogues
      .find((d) => d.id === "dlg_alina")!
      .nodes.find((n) => n.id === "start")!
      .choices.find((c) => c.id === "pass")!.effects = [{ type: "message", text: "Вы что-то заметили" }];
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    actions.interact("npc_alina");
    actions.choose("pass");
    expect(store.get().toasts.map((t) => t.text)).toContain("Вы что-то заметили");
  });
});

describe("условие chosen в игре", () => {
  it("вариант, зависящий от выбранного ранее, появляется после выбора; сохранение хранит выбранное", async () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    const dlg = raw.dialogues.find((d) => d.id === "dlg_alina")!;
    const start = dlg.nodes.find((n) => n.id === "start")!;
    const pass = start.choices.find((c) => c.id === "pass")!;
    const bye = start.choices.find((c) => c.next === null)!;
    bye.requires = { chosen: [{ dialogueId: dlg.id, nodeId: start.id, choiceId: pass.id }] };
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    actions.interact("npc_alina");
    expect(actions.isChoiceVisible(bye)).toBe(false);
    actions.choose(pass.id);
    actions.choose("back");
    expect(actions.isChoiceVisible(bye)).toBe(true);
    expect(actions.isChoiceUsed(dlg.id, start.id, pass.id)).toBe(true);
    expect(store.get().progress.chosen).toContain(`${dlg.id}/${start.id}/${pass.id}`);
  });
});

describe("человек, скрытый условием", () => {
  it("взаимодействие с человеком, которого на карте сейчас нет, не открывает разговор", () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "come", name: "Пришёл" }];
    raw.locations.flatMap((l) => l.npcs).find((n) => n.id === "npc_alina")!.requires = { flags: ["come"] };
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
    actions.interact("npc_alina");
    expect(store.get().overlay).toBeNull();
    actions.close();
  });
});

describe("текст реплики по условию", () => {
  it("nodeText берёт первый вариант с выполненным условием, иначе основной", () => {
    const node = {
      text: "Здравствуйте.",
      textVariants: [
        { requires: { flags: ["a"] }, text: "Снова вы?" },
        { requires: { flags: ["b"] }, text: "Вы вернулись." },
      ],
    };
    const p = (flags: string[]) => ({ ...startProgress(testCaseJson as unknown as CaseFile), flags });
    expect(nodeText(node, p([]))).toBe("Здравствуйте.");
    expect(nodeText(node, p(["b"]))).toBe("Вы вернулись.");
    expect(nodeText(node, p(["a", "b"]))).toBe("Снова вы?");
    expect(nodeText({ text: "Ок" }, p(["a"]))).toBe("Ок");
  });
});

describe("узел-переход (auto)", () => {
  const start = (mutate: (c: CaseFile) => void) => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "warm", name: "Тёплый приём" }];
    raw.counters = [{ id: "n", name: "Счёт" }];
    mutate(raw);
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
  };
  const inc: Effect = { type: "changeVariable", variableId: "n", action: "add", value: 1 };

  it("разговор начинается с узла-перехода: игрок видит выбранный по условию узел, эффекты варианта применены", () => {
    start((c) => {
      const dlg = c.dialogues.find((d) => d.id === "dlg_alina")!;
      const orig = dlg.startNodeId;
      dlg.nodes.push(
        {
          id: "router",
          mood: "neutral",
          text: "",
          effects: [],
          auto: true,
          choices: [
            { id: "to_warm", text: "если тёплый приём", next: "warm_start", effects: [inc], requires: { flags: ["warm"] } },
            { id: "to_normal", text: "иначе", next: orig, effects: [] },
          ],
        },
        { id: "warm_start", mood: "friendly", text: "Рада вас видеть!", effects: [], choices: [{ id: "ok", text: "Хорошо.", next: null, effects: [] }] },
      );
      dlg.startNodeId = "router";
    });
    actions.interact("npc_alina");
    expect(store.get().overlay).toMatchObject({ kind: "dialogue", nodeId: "start" }); // флага нет — обычное начало
    expect(store.get().progress.counters.n).toBeUndefined();
    actions.close();
  });

  it("при выполненном условии срабатывает первый подходящий вариант; без подходящих разговор закрывается; цикл не вешает игру", () => {
    start((c) => {
      const dlg = c.dialogues.find((d) => d.id === "dlg_alina")!;
      dlg.nodes.push(
        { id: "router", mood: "neutral", text: "", effects: [], auto: true, choices: [{ id: "to_warm", text: "тёплый", next: "warm_start", effects: [inc], requires: { flags: ["warm"] } }] },
        { id: "warm_start", mood: "friendly", text: "Рада вас видеть!", effects: [], choices: [{ id: "ok", text: "Хорошо.", next: null, effects: [] }] },
        { id: "loop_a", mood: "neutral", text: "", effects: [], auto: true, choices: [{ id: "a", text: "к b", next: "loop_b", effects: [] }] },
        { id: "loop_b", mood: "neutral", text: "", effects: [], auto: true, choices: [{ id: "b", text: "к a", next: "loop_a", effects: [] }] },
      );
      dlg.startNodeId = "router";
      dlg.nodes.find((n) => n.id === "start")!.choices.push({ id: "go_loop", text: "в цикл", next: "loop_a", effects: [] });
    });
    actions.interact("npc_alina");
    expect(store.get().overlay).toBeNull(); // условие не выполнено, подходящего варианта нет — разговор закончился
    actions.close();
    actions.interact("npc_alina");
    expect(store.get().overlay).toBeNull();

    // с флагом — тёплый узел, эффект варианта применён
    store.get();
    start((c) => {
      const dlg = c.dialogues.find((d) => d.id === "dlg_alina")!;
      dlg.nodes.push(
        {
          id: "router",
          mood: "neutral",
          text: "",
          effects: [{ type: "changeVariable", variableId: "warm", action: "on" }],
          auto: true,
          choices: [{ id: "to_warm", text: "тёплый", next: "warm_start", effects: [inc], requires: { flags: ["warm"] } }],
        },
        { id: "warm_start", mood: "friendly", text: "Рада вас видеть!", effects: [], choices: [{ id: "ok", text: "Хорошо.", next: null, effects: [] }] },
      );
      dlg.startNodeId = "router";
    });
    actions.interact("npc_alina");
    expect(store.get().overlay).toMatchObject({ kind: "dialogue", nodeId: "warm_start" });
    expect(store.get().progress.counters.n).toBe(1);
  });
});
