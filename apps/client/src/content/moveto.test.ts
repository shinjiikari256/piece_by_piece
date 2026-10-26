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
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        tiles[y + dy][x + dx] = wall;
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
