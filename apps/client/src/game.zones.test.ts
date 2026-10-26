import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateCase } from "./content/validate";
import { actions, store } from "./state/store";
import { type CaseFile, type Effect } from "../../../shared/case";
import { LocalAuthority } from "./content/local-authority";
import { setPlatform } from "./state/platform";
import { createMemoryPlatform } from "./state/memory-platform";

const casesDir = path.resolve(__dirname, "content/cases");
const load = (file: string) => JSON.parse(readFileSync(path.join(casesDir, file), "utf8"));

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
      cells: [
        { x: other.x, y: other.y },
        { x: start.x, y: start.y },
      ],
      actions: [{ kind: "effects", trigger: "enter", effects: [{ type: "moveTo", characterId: "krylov", locationId: loc.id, x: 0, y: 0, zoneId: "z_goal" }] }],
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

describe("области: режимы запуска и текст отказа", () => {
  const zoneCase = (actionsOf: (c: CaseFile) => unknown[]) => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "key", name: "Ключ" }];
    raw.counters = [{ id: "n", name: "Счёт" }];
    const loc = raw.locations[0];
    // область на первой свободной клетке пола
    const cell = loc.tiles.flatMap((row, y) => [...row].map((ch, x) => ({ ch, x, y }))).find((t) => t.ch === ".")!;
    loc.zones = [{ id: "z_test", name: "Тест", cells: [{ x: cell.x, y: cell.y }], actions: actionsOf(raw) as never }];
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
  };
  const inc: Effect = { type: "changeVariable", variableId: "n", action: "add", value: 1 };

  it("enterEvery — при каждом входе, enter — один раз, leave — при выходе", () => {
    zoneCase(() => [
      { kind: "effects", trigger: "enter", effects: [inc] },
      { kind: "effects", trigger: "enterEvery", effects: [inc, inc] },
      { kind: "effects", trigger: "leave", effects: [{ ...inc, value: 10 }] },
    ]);
    // actionKey у «enter» и «enterEvery» разный; входим дважды
    actions.enterZone("z_test");
    actions.leaveZone("z_test");
    actions.enterZone("z_test");
    actions.leaveZone("z_test");
    // «enter»: первое подходящее действие списка срабатывает на каждый вход — enter (1) один раз, затем enterEvery (2) дважды; leave: 10 + 10
    expect(store.get().progress.counters.n).toBe(1 + 2 + 10 + 10);
  });

  it("текст отказа: по клавише и при входе, пока условие не выполнено", () => {
    zoneCase(() => [{ kind: "effects", trigger: "enterEvery", requires: { flags: ["key"] }, lockedText: "Нужен ключ", effects: [inc] }]);
    actions.enterZone("z_test");
    expect(store.get().toasts.map((t) => t.text)).toContain("Нужен ключ");
    expect(actions.hasZoneAction("z_test")).toBe(true); // с текстом отказа подсказка «Взаимодействие» есть
    expect(store.get().progress.counters.n).toBeUndefined();
  });

  it("валидатор: выход не может срабатывать при выходе из области", () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.locations[0].zones = [{ id: "z_exit", name: "Выход", cells: [{ x: 1, y: 1 }], actions: [{ kind: "exit", to: raw.locations[0].id, spawn: { x: 2, y: 2 }, trigger: "leave" }] }];
    const r = validateCase(raw);
    expect(r.ok ? "" : r.errors.join("\n")).toContain("не может срабатывать при выходе");
  });
});

describe("запасной ответ области (Zone.fallback)", () => {
  const withFallback = () => {
    const raw = load("case-001.json") as unknown as CaseFile;
    raw.flags = [...(raw.flags ?? []), { id: "key", name: "Ключ" }];
    raw.counters = [{ id: "n", name: "Счёт" }];
    const loc = raw.locations[0];
    const cell = loc.tiles.flatMap((row, y) => [...row].map((ch, x) => ({ ch, x, y }))).find((t) => t.ch === ".")!;
    loc.zones = [
      {
        id: "z_fb",
        name: "Запас",
        cells: [{ x: cell.x, y: cell.y }],
        actions: [{ kind: "effects", requires: { flags: ["key"] }, effects: [] }],
        fallback: { text: "Тут пока нечего делать", effects: [{ type: "changeVariable", variableId: "n", action: "add", value: 1 }] },
      },
    ];
    const c = validateCase(raw);
    if (!c.ok) throw new Error(c.errors.join("; "));
    setPlatform(createMemoryPlatform());
    actions.openCase(new LocalAuthority(c.caseFile));
    actions.beginInvestigation();
  };

  it("срабатывает при входе, когда ни одно действие не подошло: эффекты применены, подсказка «Взаимодействие» есть", () => {
    withFallback();
    expect(actions.hasZoneAction("z_fb")).toBe(true);
    actions.enterZone("z_fb");
    expect(store.get().progress.counters.n).toBe(1);
  });
});
