import { describe, expect, it } from "vitest";
import { emptyProgress, applyEffects } from "../../../../shared/conditions";
import type { CaseFile, Effect } from "../../../../shared/case";
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

describe("эффект removeFlag", () => {
  it("снимает флаг, повторно — безопасно; исходное состояние не меняется", () => {
    const start = { ...emptyProgress(), flags: ["a", "b"] };
    const { progress } = applyEffects([{ type: "removeFlag", flag: "a" }, { type: "removeFlag", flag: "нет_такого" }], start);
    expect(progress.flags).toEqual(["b"]);
    expect(start.flags).toEqual(["a", "b"]);
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
    expect(withEffect(move("krylov", loc.playerStart.x, loc.playerStart.y))).toEqual([]);
  });

  it("неизвестная локация и персонаж", () => {
    expect(withEffect(move("krylov", 1, 1, "нет_такой")).join("\n")).toContain("неизвестная локация");
    expect(withEffect(move("нет_такого", loc.playerStart.x, loc.playerStart.y)).join("\n")).toContain("неизвестная ссылка");
  });

  it("клетка не пол или занята другим человеком", () => {
    expect(withEffect(move("krylov", 0, 0)).join("\n")).toContain("не пол");
    const other = loc.npcs.find((n) => n.characterId !== "krylov")!;
    expect(withEffect(move("krylov", other.x, other.y)).join("\n")).toContain("занята");
  });

  it("клетка, до которой не дойти от места персонажа, — ошибка", () => {
    const { x, y } = loc.playerStart;
    const wall = loc.tiles[0][0];
    const errors = withEffect(move("krylov", x, y), (c) => {
      const tiles = c.locations[0].tiles.map((row) => row.split(""));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) tiles[y + dy][x + dx] = wall;
      c.locations[0].tiles = tiles.map((row) => row.join(""));
    });
    expect(errors.join("\n")).toContain("не дойти");
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
      zone("zone_hall", { actions: [{ kind: "dialogue", dialogueId: c.dialogues[0].id, auto: true }, { kind: "object", objectId: obj.id, requires: { flags: [] } }] }),
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
    const floorCell = c.locations[0].playerStart;
    c.locations[0].zones = [
      zone("exit_a", { actions: [{ kind: "exit", to: "нет_такой", spawn: floorCell }] }),
      zone("exit_b", { actions: [{ kind: "exit", to: c.locations[0].id, spawn: { x: 0, y: 0 } }] }), // 0,0 — стена
      zone("exit_c", { cells: [floorCell], actions: [{ kind: "exit", to: c.locations[0].id, spawn: floorCell, auto: true }] }), // spawn сразу в области с автовыходом
    ];
    const text = errorsOf(c);
    expect(text).toContain("неизвестная ссылка «нет_такой»");
    expect(text).toContain("spawn не на полу");
    expect(text).toContain("сразу выкинет обратно");
  });
});

describe("миграция формата 1 → 2", () => {
  it("выходы становятся областями с действием exit, триггер диалога — действием области", async () => {
    const { migrateCase } = await import("../../../../shared/migrate");
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
    expect(migrated.zones.find((z) => z.id === "z1")!.actions).toEqual([{ kind: "dialogue", dialogueId: (old.dialogues as { id: string }[])[0].id, requires: { flags: ["a"] }, auto: true }]);
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
    c.dialogues.push({ id: "dlg_lonely", characterId: c.characters[0].id, startNodeId: "s", nodes: [{ id: "s", text: "…", mood: "neutral", effects: [], choices: [{ id: "end", text: "ок", next: null, requires: { flags: ["flag_never_set"] } }] }] });
    c.locations[0].zones = [{ id: "z_empty", name: "Пустая", cells: [{ x: 1, y: 1 }], actions: [] }];
    const text = caseWarnings(c).join("\n");
    expect(text).toContain("dialogue dlg_lonely: никто не запускает");
    expect(text).toContain("zone z_empty: у области нет действий");
    expect(text).toContain("flag flag_never_set: условия ждут этот флаг");
  });
});
