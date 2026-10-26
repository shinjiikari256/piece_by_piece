import { rawCase, type Raw } from "./raw-case";
import { describe, expect, it } from "vitest";
import case002 from "./cases/case-002.json";
import { migrateCase } from "../../../../shared/migrate";
import case001 from "./cases/case-001.json";

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
      locations: [
        {
          id: "l",
          npcs: [
            { id: "n1", characterId: "a", dialogueId: "da", x: 1, y: 1 },
            { id: "n2", characterId: "b", dialogueId: "db", x: 2, y: 1 },
            { id: "n3", characterId: "c", dialogueId: "dc", x: 3, y: 1 },
          ],
        },
      ],
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

describe("миграция 4 → 5: переменные", () => {
  it("setFlag/removeFlag/changeCounter становятся changeVariable, у предмета убирается type", () => {
    const old = rawCase(case001);
    old.formatVersion = 4;
    old.dialogues[0].nodes[0].effects = [
      { type: "setFlag", flag: "a" },
      { type: "removeFlag", flag: "b" },
      { type: "changeCounter", counterId: "c", mode: "add", value: -2 },
      { type: "changeCounter", counterId: "c", mode: "set", value: 7 },
    ];
    const obj = old.locations.flatMap((l: Raw) => l.objects).find((o: Raw) => o.interaction);
    obj.interaction = { type: "evidence", ...obj.interaction };
    const r = migrateCase(old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const data = r.data as Raw;
    expect(data.dialogues[0].nodes[0].effects).toEqual([
      { type: "changeVariable", variableId: "a", action: "on" },
      { type: "changeVariable", variableId: "b", action: "off" },
      { type: "changeVariable", variableId: "c", action: "subtract", value: 2 },
      { type: "changeVariable", variableId: "c", action: "set", value: 7 },
    ]);
    expect(data.locations.flatMap((l: Raw) => l.objects).find((o: Raw) => o.interaction).interaction.type).toBeUndefined();
  });
});

describe("миграция 5 → 6: onInteract", () => {
  it("interaction.effects переезжают в onInteract объекта", () => {
    const old = rawCase(case001);
    old.formatVersion = 5;
    const obj = old.locations.flatMap((l: Raw) => l.objects).find((o: Raw) => o.interaction);
    delete obj.onInteract;
    obj.interaction.effects = [{ type: "changeVariable", variableId: "a", action: "on" }];
    const r = migrateCase(old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const moved = (r.data.locations as Raw[]).flatMap((l) => l.objects).find((o) => o.id === obj.id);
    expect(moved.interaction.effects).toBeUndefined();
    // «только первый осмотр» стало настройкой эффекта
    expect(moved.onInteract).toEqual([{ type: "changeVariable", variableId: "a", action: "on", once: true }]);
  });
});

describe("миграция 6 → 7: trigger области", () => {
  it("auto: true становится trigger: enter", () => {
    const old = rawCase(case002);
    old.formatVersion = 6;
    old.locations[0].zones = [
      {
        id: "z",
        name: "Z",
        cells: [{ x: 1, y: 1 }],
        actions: [
          { kind: "effects", effects: [], auto: true },
          { kind: "effects", effects: [] },
        ],
      },
    ];
    const r = migrateCase(old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.data.locations as Raw[])[0].zones[0].actions).toEqual([
      { kind: "effects", effects: [], trigger: "enter" },
      { kind: "effects", effects: [] },
    ]);
  });
});
