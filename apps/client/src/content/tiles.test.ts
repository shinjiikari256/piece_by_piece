import { afterAll, describe, expect, it } from "vitest";
import type { CaseFile } from "../../../../shared/case";
import { migrateCase } from "../../../../shared/migrate";
import { FLOOR_TILES, TILES, TILE_LEGEND, WALL_TILES, registerCaseTiles } from "../game/art";
import { charsOf, copyTile, newTile, removeTile, setTileChar, tileUses, tileView } from "../editor/sprites/tile-helpers";
import testCase from "./test-cases/case-test-moveto.json";
import { validateCase } from "./validate";

const base = () => structuredClone(testCase) as unknown as CaseFile;
const errorsOf = (c: CaseFile): string[] => {
  const r = validateCase(c);
  return r.ok ? [] : r.errors;
};

afterAll(() => registerCaseTiles({}));

describe("тайлы дела", () => {
  it("тестовое дело с тайлами проходит проверку, тайлы подключаются к таблицам", () => {
    expect(errorsOf(base())).toEqual([]);
    expect(TILES.test_mosaic).toBeDefined();
    expect(FLOOR_TILES.has("1")).toBe(true);
    expect(WALL_TILES.has("2")).toBe(true);
  });

  it("тайлы убираются вместе с делом, встроенные не затираются", () => {
    validateCase(base());
    registerCaseTiles({});
    expect(TILES.test_mosaic).toBeUndefined();
    expect(TILE_LEGEND["#"]).toBe("wall");
    expect(WALL_TILES.has("#")).toBe(true);
    expect(FLOOR_TILES.has("S")).toBe(true);
  });

  it("проверки: встроенный ключ, неизвестная основа, выход за размер, легенда с неизвестным тайлом", () => {
    const c = base();
    c.tiles = [...(c.tiles ?? []), { key: "wall", name: "Подмена", solid: true, layers: [{ ops: [] }] }, { key: "bad", name: "Плохой", solid: false, base: "nope", layers: [{ ops: [[10, 10, 8, 8, "#ffffff"]] }] }];
    c.legend = { ...c.legend, "9": "ghost" };
    const errs = errorsOf(c).join("\n");
    expect(errs).toContain("tile wall: ключ совпадает со встроенным тайлом");
    expect(errs).toContain("tile bad: основа «nope»");
    expect(errs).toContain("tile bad: слой 1: прямоугольник выходит за размер 16×16");
    expect(errs).toContain("legend: символ «9» ведёт на неизвестный тайл «ghost»");
  });

  it("неизвестный символ на карте — ошибка, если его нет в легенде", () => {
    const c = base();
    c.locations[0].tiles[1] = "Q" + c.locations[0].tiles[1].slice(1);
    expect(errorsOf(c).join("\n")).toContain("неизвестный тайл «Q»");
  });

  it("миграция 10 → 11 добавляет легенду со встроенными символами", () => {
    const { legend: _l, tiles: _t, ...old } = base();
    const r = migrateCase({ ...old, formatVersion: 10 });
    if (!r.ok) throw new Error(r.error);
    const out = r.data as unknown as CaseFile;
    expect(out.legend?.["#"]).toBe("wall");
    expect(out.legend?.p).toBe("sidewalk");
  });
});

describe("помощники редактора тайлов", () => {
  const d = (): CaseFile => {
    const c = base();
    return { ...c, tiles: [], legend: undefined };
  };

  it("новый тайл получает свободный символ и ключ; копия — свои", () => {
    const made = newTile(d())!;
    expect(made.draft.tiles).toHaveLength(1);
    const ch = charsOf(made.draft, made.tile.key);
    expect(ch).toHaveLength(1);
    expect(made.draft.legend?.["#"]).toBe("wall");
    const copy = copyTile(made.draft, made.tile)!;
    expect(copy.tile.key).not.toBe(made.tile.key);
    expect(charsOf(copy.draft, copy.tile.key)[0]).not.toBe(ch[0]);
  });

  it("смена символа: занятый другим тайлом — отказ; свой прежний освобождается", () => {
    const made = newTile(d())!;
    expect(setTileChar(made.draft, made.tile.key, "#")).toBeNull();
    const moved = setTileChar(made.draft, made.tile.key, "&")!;
    expect(charsOf(moved, made.tile.key)).toEqual(["&"]);
  });

  it("использование на картах и удаление", () => {
    const made = newTile(d())!;
    const [ch] = charsOf(made.draft, made.tile.key);
    const c = made.draft;
    c.locations[0].tiles[1] = ch + c.locations[0].tiles[1].slice(1);
    expect(tileUses(c, made.tile.key)).toHaveLength(1);
    const removed = removeTile(c, made.tile.key);
    expect(removed.tiles).toEqual([]);
    expect(charsOf(removed, made.tile.key)).toEqual([]);
  });

  it("встроенный тайл виден как тайл дела", () => {
    expect(tileView({}, "wall")?.solid).toBe(true);
    expect(tileView({}, "nope")).toBeNull();
  });
});
