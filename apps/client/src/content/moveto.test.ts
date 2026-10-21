import { describe, expect, it } from "vitest";
import { emptyProgress, applyEffects, choiceKey, meets, startProgress } from "../../../../shared/conditions";
import case002 from "./cases/case-002.json";
import { deleteCounter } from "../editor/sections/Counters";
import { deleteFlag, evidenceUsage, flagUsage } from "../editor/fields/variables";
import { deleteEnum, deleteEnumValue, renameEnumValue } from "../editor/sections/Enums";
import { caseWarnings } from "./warnings";
import { countRefs, renameKey } from "../editor/keys";
import { migrateCase } from "../../../../shared/migrate";
import type { CaseFile, Condition, Effect } from "../../../../shared/case";
import case001 from "./cases/case-001.json";
import testCase from "./test-cases/case-test-moveto.json";
import { validateCase } from "./validate";

const move = (characterId: string, x: number, y: number, locationId = "admin_building"): Effect => ({ type: "moveTo", characterId, locationId, x, y });

describe("эффект moveTo: ядро", () => {
  it("записывает итоговое место и снимает персонажа с «идёт следом»", () => {
    const start = { ...emptyProgress(), followers: ["krylov", "alina"] };
    const { progress } = applyEffects([move("krylov", 12, 8)], start);
    expect(progress.npcPlaces.krylov).toEqual({ locationId: "admin_building", x: 12, y: 8 });
    expect(progress.followers).toEqual(["alina"]);
    expect(start.followers).toEqual(["krylov", "alina"]); // исходное состояние не меняется
  });

  it("повторный moveTo заменяет место, returnHome возвращает на исходное", () => {
    const first = applyEffects([move("alina", 5, 5)], emptyProgress()).progress;
    const second = applyEffects([move("alina", 6, 6)], first).progress;
    expect(second.npcPlaces.alina).toMatchObject({ x: 6, y: 6 });
    expect(applyEffects([{ type: "returnHome", characterId: "alina" }], second).progress.npcPlaces.alina).toBeUndefined();
  });
});

describe("эффект changeVariable: флаги", () => {
  it("снимает флаг, повторно — безопасно; исходное состояние не меняется", () => {
    const start = { ...emptyProgress(), flags: ["a", "b"] };
    const { progress } = applyEffects([{ type: "changeVariable", variableId: "a", action: "off" }, { type: "changeVariable", variableId: "нет_такого", action: "off" }], start);
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

describe("эффект moveTo: валидатор", () => {
  const withEffect = (effect: Effect, mutate?: (c: CaseFile) => void) => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.dialogues[0].nodes[0].effects.push(effect);
    mutate?.(c);
    const r = validateCase(c);
    return r.ok ? [] : r.errors;
  };
  const loc = (case001 as unknown as CaseFile).locations[0];

  it("свободная достижимая клетка пола — без ошибок", () => {
    expect(withEffect(move("krylov", loc.playerStart!.x, loc.playerStart!.y))).toEqual([]);
  });

  it("неизвестная локация и персонаж", () => {
    expect(withEffect(move("krylov", 1, 1, "нет_такой")).join("\n")).toContain("неизвестная локация");
    expect(withEffect(move("нет_такого", loc.playerStart!.x, loc.playerStart!.y)).join("\n")).toContain("неизвестная ссылка");
  });

  it("клетка не пол или занята другим человеком", () => {
    expect(withEffect(move("krylov", 0, 0)).join("\n")).toContain("не пол");
    const other = loc.npcs.find((n) => n.characterId !== "krylov")!;
    expect(withEffect(move("krylov", other.x, other.y)).join("\n")).toContain("занята");
  });

  it("клетка, до которой не дойти от места персонажа, — ошибка", () => {
    const { x, y } = loc.playerStart!;
    const wall = loc.tiles[0][0];
    const errors = withEffect(move("krylov", x, y), (c) => {
      const tiles = c.locations[0].tiles.map((row) => row.split(""));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) tiles[y + dy][x + dx] = wall;
      c.locations[0].tiles = tiles.map((row) => row.join(""));
    });
    expect(errors.join("\n")).toContain("не дойти");
  });

  describe("цель — область", () => {
    const zoned = (zoneId: string, cells: { x: number; y: number }[]) =>
      withEffect({ type: "moveTo", characterId: "krylov", locationId: "admin_building", x: 0, y: 0, zoneId }, (c) => {
        c.locations[0].zones.push({ id: "z_target", name: "Цель", cells, actions: [] } as never);
      });
    it("область со свободной клеткой — без ошибок (запасная x, y не проверяется)", () => {
      expect(zoned("z_target", [loc.playerStart!])).toEqual([]);
    });
    it("нет такой области / вся область занята или стена", () => {
      expect(zoned("нет_такой", [loc.playerStart!]).join("\n")).toContain("нет области");
      expect(zoned("z_target", [{ x: 0, y: 0 }]).join("\n")).toContain("нет свободной клетки");
    });
  });
});

describe("тестовое дело case-test-moveto", () => {
  it("проходит валидацию и содержит все сценарии moveTo", () => {
    const r = validateCase(testCase);
    expect(r.ok ? [] : r.errors).toEqual([]);
    const effects = (testCase as unknown as CaseFile).dialogues.flatMap((d) => d.nodes.flatMap((n) => n.effects));
    expect(effects.filter((e) => e.type === "moveTo").length).toBeGreaterThanOrEqual(5);
    expect(effects.some((e) => e.type === "moveTo" && e.failText)).toBe(true); // с руганью при неудаче
    expect(effects.some((e) => e.type === "moveTo" && e.locationId === "dorm_lobby")).toBe(true); // в другую локацию
  });
});

describe("области и их действия: формат и валидатор", () => {
  const base = () => structuredClone(case001) as unknown as CaseFile;
  const errorsOf = (c: CaseFile) => {
    const r = validateCase(c);
    return r.ok ? "" : r.errors.join("\n");
  };
  const zone = (id: string, over: Partial<CaseFile["locations"][0]["zones"][0]> = {}) => ({ id, name: "Холл", cells: [{ x: 15, y: 13 }, { x: 16, y: 13 }], actions: [], ...over });

  it("дело без областей проходит (области по умолчанию пустые)", () => {
    expect(errorsOf(base())).toEqual("");
    expect(base().locations.every((l) => l.zones.length === 0)).toBe(true);
  });

  it("область с действиями «диалог» и «предмет» — без ошибок", () => {
    const c = base();
    const obj = c.locations[0].objects.find((o) => o.interaction)!;
    c.locations[0].zones = [
      zone("zone_hall", { actions: [{ kind: "dialogue", dialogueId: c.dialogues[0].id, trigger: "enter" }, { kind: "object", objectId: obj.id, requires: { flags: [] } }] }),
    ];
    expect(errorsOf(c)).toEqual("");
  });

  it("ошибки: пустая область, клетка вне карты, повтор id, неизвестный диалог и предмет, предмет-декорация", () => {
    const c = base();
    const decoration = c.locations[0].objects.find((o) => !o.interaction)!;
    c.locations[0].zones = [
      zone("z", { cells: [] }),
      zone("z", { cells: [{ x: 999, y: 0 }], actions: [{ kind: "dialogue", dialogueId: "нет_такого" }, { kind: "object", objectId: decoration.id }, { kind: "object", objectId: "нет_предмета" }] }),
    ];
    const text = errorsOf(c);
    expect(text).toContain("область пуста");
    expect(text).toContain("вне карты");
    expect(text).toContain("повторяющийся id «z»");
    expect(text).toContain("неизвестная ссылка «нет_такого»");
    expect(text).toContain("это декорация");
    expect(text).toContain("неизвестная ссылка «нет_предмета»");
  });

  it("цвет области — только вида #rrggbb", () => {
    const c = base();
    c.locations[0].zones = [zone("zc", { color: "#3f9e5a" })];
    expect(errorsOf(c)).toEqual("");
    c.locations[0].zones = [zone("zc", { color: "зелёный" })];
    expect(errorsOf(c)).toContain("нужен вид #rrggbb");
  });

  it("выход: неизвестная локация, spawn не на полу и в области с автоматическим выходом", () => {
    const c = base();
    const floorCell = c.locations[0].playerStart!;
    c.locations[0].zones = [
      zone("exit_a", { actions: [{ kind: "exit", to: "нет_такой", spawn: floorCell }] }),
      zone("exit_b", { actions: [{ kind: "exit", to: c.locations[0].id, spawn: { x: 0, y: 0 } }] }), // 0,0 — стена
      zone("exit_c", { cells: [floorCell], actions: [{ kind: "exit", to: c.locations[0].id, spawn: floorCell, trigger: "enter" }] }), // spawn сразу в области с автовыходом
    ];
    const text = errorsOf(c);
    expect(text).toContain("неизвестная ссылка «нет_такой»");
    expect(text).toContain("spawn не на полу");
    expect(text).toContain("сразу выкинет обратно");
  });
});

describe("миграция формата 1 → 2", () => {
  it("выходы становятся областями с действием exit, триггер диалога — действием области", async () => {
    const old = structuredClone(case001) as Record<string, unknown>;
    old.formatVersion = 1;
    const loc = (old.locations as Record<string, unknown>[])[0];
    loc.exits = [{ id: "stairs", x: 15, y: 13, to: loc.id, spawn: { x: 15, y: 13 }, label: "Лестница" }];
    loc.zones = [{ id: "z1", name: "Зона", cells: [{ x: 1, y: 1 }] }];
    (old.dialogues as Record<string, unknown>[])[0].trigger = { kind: "zone", zoneId: "z1", auto: true };
    (old.dialogues as Record<string, unknown>[])[0].requires = { flags: ["a"] };
    const m = migrateCase(old);
    expect(m.ok).toBe(true);
    const data = (m as { data: Record<string, unknown> }).data;
    const migrated = (data.locations as { exits?: unknown; zones: { id: string; name: string; cells: unknown[]; actions: unknown[] }[] }[])[0];
    expect(migrated.exits).toBeUndefined();
    const exit = migrated.zones.find((z) => z.id === "stairs")!;
    expect(exit.name).toBe("Лестница");
    expect(exit.actions).toEqual([{ kind: "exit", to: loc.id, spawn: { x: 15, y: 13 } }]);
    expect(exit.cells.length).toBeGreaterThan(1); // клетка выхода и проходимые соседи
    expect(migrated.zones.find((z) => z.id === "z1")!.actions).toEqual([{ kind: "dialogue", dialogueId: (old.dialogues as { id: string }[])[0].id, requires: { flags: ["a"] }, trigger: "enter" }]);
    expect((data.dialogues as Record<string, unknown>[])[0].trigger).toBeUndefined();
    expect(typeof data.formatVersion).toBe("number");
  });
});

describe("миграция формата 2 → 3", () => {
  it("очная ставка становится диалогами участников по условию «другой идёт за игроком»", async () => {
    const { caseMigrations } = await import("../../../../shared/migrate");
    const old = {
      formatVersion: 2,
      locations: [{ id: "l", npcs: [{ id: "n1", characterId: "a", dialogueId: "da", x: 1, y: 1 }, { id: "n2", characterId: "b", dialogueId: "db", x: 2, y: 1 }, { id: "n3", characterId: "c", dialogueId: "dc", x: 3, y: 1 }] }],
      confrontations: [{ id: "c1", characters: ["a", "b"], dialogueId: "dab", requires: { notFlags: ["done"] } }],
    };
    const next = caseMigrations[2](old) as { confrontations?: unknown; locations: { npcs: { characterId: string; dialogues: unknown[] }[] }[] };
    expect(next.confrontations).toBeUndefined();
    const [a, b, c] = next.locations[0].npcs;
    expect(a.dialogues).toEqual([{ dialogueId: "dab", requires: { notFlags: ["done"], following: ["b"] } }]);
    expect(b.dialogues).toEqual([{ dialogueId: "dab", requires: { notFlags: ["done"], following: ["a"] } }]);
    expect(c.dialogues).toEqual([]);
    expect(old.confrontations).toHaveLength(1); // вход не меняется
  });
});

describe("предупреждения дела", () => {
  it("готовые дела без предупреждений о диалогах и областях; ловятся недостижимый диалог, флаг без источника, область без действий", async () => {
    const { caseWarnings } = await import("./warnings");
    expect(caseWarnings(structuredClone(case001) as unknown as CaseFile).filter((w) => w.startsWith("dialogue") || w.includes("/zone"))).toEqual([]);
    const c = structuredClone(case001) as unknown as CaseFile;
    c.dialogues.push({ id: "dlg_lonely", characterId: c.characters[0].id, startNodeId: "s", nodes: [{ id: "s", text: "…", mood: "neutral", effects: [], choices: [{ id: "end", text: "ок", next: null, effects: [], requires: { flags: ["flag_never_set"] } }] }] });
    c.locations[0].zones = [{ id: "z_empty", name: "Пустая", cells: [{ x: 1, y: 1 }], actions: [] }];
    const text = caseWarnings(c).join("\n");
    expect(text).toContain("dialogue dlg_lonely: никто не запускает");
    expect(text).toContain("zone z_empty: у области нет действий");
    expect(text).toContain("flag flag_never_set: условия ждут этот флаг");
  });
  it("счётчики: условие вне границ и счётчик, который никто не меняет", async () => {
    const { caseWarnings } = await import("./warnings");
    const c = structuredClone(case001) as unknown as CaseFile;
    c.counters = [{ id: "k_out", name: "Вне", initial: 0, min: 0, max: 5 }, { id: "k_stuck", name: "Стоит", initial: 0 }];
    c.dialogues.push({ id: "dlg_k", characterId: c.characters[0].id, startNodeId: "s", nodes: [{ id: "s", text: "…", mood: "neutral", effects: [], choices: [
      { id: "a", text: "a", next: null, effects: [], requires: { counters: [{ counterId: "k_out", min: 6 }] } },
      { id: "b", text: "b", next: null, effects: [], requires: { counters: [{ counterId: "k_stuck", min: 1 }] } },
      { id: "c", text: "c", next: null, effects: [] },
    ] }] });
    const text = caseWarnings(c).join("\n");
    expect(text).toContain("counter k_out: условие требует значение вне границ");
    expect(text).toContain("counter k_stuck: никакой эффект не меняет счётчик");
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
  c.locations[0].objects.push({ id: "d_or", sprite: "door_h", x: 0, y: 0, label: "", interaction: null, onInteract: [], states: [{ id: "s", when: { anyOf: [{ inLocation: ["нет_такой"] }] } }] } as never);
  const r = validateCase(c);
  expect(r.ok === false && r.errors.some((e) => e.includes("нет_такой"))).toBe(true);
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

/* eslint-disable @typescript-eslint/no-explicit-any -- сырые данные старого формата */
describe("миграция 4 → 5: переменные", () => {
  it("setFlag/removeFlag/changeCounter становятся changeVariable, у предмета убирается type", () => {
    const old = structuredClone(case001) as unknown as Record<string, any>;
    old.formatVersion = 4;
    old.dialogues[0].nodes[0].effects = [
      { type: "setFlag", flag: "a" },
      { type: "removeFlag", flag: "b" },
      { type: "changeCounter", counterId: "c", mode: "add", value: -2 },
      { type: "changeCounter", counterId: "c", mode: "set", value: 7 },
    ];
    const obj = old.locations.flatMap((l: any) => l.objects).find((o: any) => o.interaction);
    obj.interaction = { type: "evidence", ...obj.interaction };
    const r = migrateCase(old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const data = r.data as any;
    expect(data.dialogues[0].nodes[0].effects).toEqual([
      { type: "changeVariable", variableId: "a", action: "on" },
      { type: "changeVariable", variableId: "b", action: "off" },
      { type: "changeVariable", variableId: "c", action: "subtract", value: 2 },
      { type: "changeVariable", variableId: "c", action: "set", value: 7 },
    ]);
    expect(data.locations.flatMap((l: any) => l.objects).find((o: any) => o.interaction).interaction.type).toBeUndefined();
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */

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
    const fx = (action: "add" | "subtract" | "set", value: number, p = emptyProgress()) =>
      applyEffects([{ type: "changeVariable", variableId: "hp", action, value }], p, { counters: defs }).progress;
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
    c.locations[0].objects.push({ id: "d_cnt", sprite: "door_h", x: 0, y: 0, label: "", interaction: null, onInteract: [], states: [{ id: "s", when: { counters: [{ counterId: "trust", min: 5, max: 1 }] } }] } as never);
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
    expect(out.counters).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("trust");
    expect(out.dialogues[0].nodes[0].choices[0].requires).toBeUndefined();
  });
});

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

describe("перечисления", () => {
  const withEnum = () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.enums = [{ id: "safe", name: "Сейф", values: [{ id: "closed", name: "Закрыт" }, { id: "open", name: "Открыт" }, { id: "broken", name: "Сломан" }] }];
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

describe("миграция 5 → 6: onInteract", () => {
  it("interaction.effects переезжают в onInteract объекта", () => {
    const old = structuredClone(case001) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    old.formatVersion = 5;
    const obj = old.locations.flatMap((l: any) => l.objects).find((o: any) => o.interaction); // eslint-disable-line @typescript-eslint/no-explicit-any
    delete obj.onInteract;
    obj.interaction.effects = [{ type: "changeVariable", variableId: "a", action: "on" }];
    const r = migrateCase(old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const moved = (r.data.locations as any[]).flatMap((l) => l.objects).find((o) => o.id === obj.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(moved.interaction.effects).toBeUndefined();
    // «только первый осмотр» стало настройкой эффекта
    expect(moved.onInteract).toEqual([{ type: "changeVariable", variableId: "a", action: "on", once: true }]);
  });
});

describe("миграция 6 → 7: trigger области", () => {
  it("auto: true становится trigger: enter", () => {
    const old = structuredClone(case002) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    old.formatVersion = 6;
    old.locations[0].zones = [{ id: "z", name: "Z", cells: [{ x: 1, y: 1 }], actions: [{ kind: "effects", effects: [], auto: true }, { kind: "effects", effects: [] }] }];
    const r = migrateCase(old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.data.locations as any[])[0].zones[0].actions).toEqual([{ kind: "effects", effects: [], trigger: "enter" }, { kind: "effects", effects: [] }]); // eslint-disable-line @typescript-eslint/no-explicit-any
  });
});

describe("эффекты removeEvidence, startDialogue, travel", () => {
  it("removeEvidence убирает улику и сообщает об этом; повторно — нет", () => {
    const p = { ...emptyProgress(), collected: ["a", "b"] };
    const out = applyEffects([{ type: "removeEvidence", evidenceId: "a" }, { type: "removeEvidence", evidenceId: "a" }], p);
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

describe("«где используется»: счётчики, перечисления, улики", () => {
  const base = () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.counters = [{ id: "hp", name: "Здоровье" }];
    c.enums = [{ id: "safe", name: "Сейф", values: [{ id: "closed", name: "Закрыт" }, { id: "open", name: "Открыт" }] }];
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

describe("человек на карте по условию; диалог не застревает", () => {
  it("npc.requires: проверяется валидатором, учитывается в «где используется» и при удалении флага", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    c.flags = [{ id: "show", name: "Показать" }];
    c.locations[0].npcs[0].requires = { flags: ["show"], evidence: ["нет_улики"] };
    const r = validateCase(c);
    expect(r.ok ? "" : r.errors.join("\n")).toContain("нет_улики");
    c.locations[0].npcs[0].requires = { flags: ["show"] };
    expect(flagUsage(c).get("show")?.some((u) => u.where.startsWith("Человек на карте"))).toBe(true);
    expect(deleteFlag(c, "show").locations[0].npcs[0].requires).toBeUndefined();
  });
  it("предупреждение: у всех вариантов реплики есть условие", () => {
    const c = structuredClone(case001) as unknown as CaseFile;
    const node = c.dialogues[0].nodes[0];
    node.choices.forEach((ch) => (ch.requires = { flags: ["x"] }));
    expect(caseWarnings(c).join("\n")).toContain("останется только «Закончить разговор»");
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
