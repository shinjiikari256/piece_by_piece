import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CASE_FORMAT_VERSION, migrateCase, migrateSave, parseCase } from "../../../shared/migrate";
import { validateCase } from "./content/validate";
import { readSave, writeSave } from "./state/persistence";

const current = JSON.parse(readFileSync(path.resolve(__dirname, "content/cases/case-001.json"), "utf8"));

describe("версия формата дела", () => {
  it("файлы в репозитории в текущем формате и проходят валидацию", () => {
    expect(current.formatVersion).toBe(CASE_FORMAT_VERSION);
    expect(validateCase(current).ok).toBe(true);
  });

  it("дело без formatVersion считается версией 1 и мигрирует до текущей", () => {
    const { formatVersion: _f, ...old } = structuredClone(current);
    const result = validateCase(old);
    expect(result.ok && result.caseFile.formatVersion).toBe(CASE_FORMAT_VERSION);
  });

  it("цепочка применяется по порядку; вход не изменяется", () => {
    const chain = { 1: (d: Record<string, unknown>) => ({ ...d, title: `${String(d.title)}!` }) };
    const old = { ...structuredClone(current), formatVersion: 1 };
    const snapshot = JSON.stringify(old);
    const m = migrateCase(old, chain, 2);
    expect(JSON.stringify(old)).toBe(snapshot);
    expect(m).toMatchObject({ ok: true, data: { formatVersion: 2, title: `${current.title}!` } });
  });

  it("версия новее поддерживаемой, неверная версия и мусор отклоняются", () => {
    expect(parseCase({ ...current, formatVersion: CASE_FORMAT_VERSION + 1 })).toMatchObject({ success: false });
    expect(parseCase({ ...current, formatVersion: "1" })).toMatchObject({ success: false });
    expect(parseCase(null)).toMatchObject({ success: false });
  });
});

describe("миграция сохранения", () => {
  const memory = new Map<string, string>();
  beforeEach(() => {
    memory.clear();
    Object.assign(globalThis, {
      localStorage: {
        get length() {
          return memory.size;
        },
        key: (i: number) => [...memory.keys()][i] ?? null,
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => void memory.set(k, v),
        removeItem: (k: string) => void memory.delete(k),
        clear: () => memory.clear(),
      },
    });
  });

  it("цепочка применяется по порядку и ставит текущую версию", () => {
    const chain = {
      1: (d: Record<string, unknown>) => ({ ...d, a: 1 }),
      2: (d: Record<string, unknown>) => ({ ...d, b: Number(d.a) + 1 }),
    };
    expect(migrateSave({ v: 1 }, chain, 3)).toEqual({ ok: true, data: { v: 3, a: 1, b: 2 } });
    expect(migrateSave({ v: 4 }, chain, 3)).toMatchObject({ ok: false });
    expect(migrateSave({ v: 2 }, {}, 3)).toMatchObject({ ok: false });
  });

  it("сохранение читается через миграцию; новее версия, мусор и чужое дело — null", () => {
    const save = {
      caseId: "case-001", screen: "play" as const, progress: { collected: [], deductions: [], characterNotes: {}, flags: [] },
      examined: [], usedChoices: [], wrongDeductions: 0, playerNotes: "", hintsUsed: 0, answers: {}, locationId: "l1",
    };
    expect(writeSave(save as unknown as Parameters<typeof writeSave>[0])).toBe(true);
    expect(readSave("case-001")?.caseId).toBe("case-001");
    const [key, value] = [...memory.entries()][0];
    memory.set(key, JSON.stringify({ ...JSON.parse(value), v: 99 }));
    expect(readSave("case-001")).toBeNull();
    memory.set(key, "not json");
    expect(readSave("case-001")).toBeNull();
    expect(readSave("other")).toBeNull();
  });
});

describe("миграция 9 → 10: двери становятся предметами", () => {
  const old = {
    ...structuredClone(current),
    formatVersion: 9,
  };
  old.locations = old.locations.map((l: { objects: unknown[] }, i: number) => ({
    ...l,
    objects: l.objects.filter((o) => (o as { id: string }).id !== "d_free" && (o as { id: string }).id !== "d_lock"),
    doors:
      i === 0
        ? [
            { id: "d_free", x: 0, y: 0, orientation: "h" },
            { id: "d_lock", x: 3, y: 4, orientation: "v", requires: { flags: ["k"] }, lockedText: "Нужен ключ" },
          ]
        : [],
  }));

  it("дверь без условия — предмет door_h/door_v без состояний, вертикальная смещается на клетку вниз", () => {
    const m = migrateCase(old);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const objs = (m.data as { locations: { objects: { id: string; sprite: string; y: number; states?: unknown[] }[]; doors?: unknown }[] }).locations[0];
    const free = objs.objects.find((o) => o.id === "d_free")!;
    expect(free).toMatchObject({ sprite: "door_h", x: 0, y: 0 });
    expect(free.states).toBeUndefined();
    expect(objs.doors).toBeUndefined();
  });

  it("запертая дверь — состояния unlocked (по условию) и locked (непроходимо, сообщение)", () => {
    const m = migrateCase(old);
    if (!m.ok) throw new Error(m.error);
    const lock = (m.data as { locations: { objects: { id: string; sprite: string; y: number; states: { id: string; solid?: boolean; onInteract?: { text: string }[] }[] }[] }[] }).locations[0].objects.find((o) => o.id === "d_lock")!;
    expect(lock).toMatchObject({ sprite: "door_v", y: 5 });
    expect(lock.states.map((s) => s.id)).toEqual(["unlocked", "locked"]);
    expect(lock.states[1].solid).toBe(true);
    expect(lock.states[1].onInteract?.[0].text).toBe("Заперто. Нужен ключ");
  });
});
