import type { CustomTile } from "../../../../../../shared/case";
import { bumpArtVersion } from "../sprites/registry";
import { DEFAULT_TILE_LEGEND, TILE_LEGEND, rebuildTileTables } from "../tiles";
import { TILES, TILE_GROUPS, type TileSpec } from "./model";

/** Ключи тайлов дела, добавленные в `TILES` сейчас. */
let custom: string[] = [];
let lastJson = "";

export const tileSpecOf = (t: CustomTile): TileSpec => {
  const { key: _k, ...rest } = t;
  return rest as unknown as TileSpec;
};

/**
 * Подключить тайлы и легенду карты текущего дела: тайлы дела попадают в `TILES` (встроенный ключ затереть нельзя),
 * легенда заменяет `TILE_LEGEND` (нет легенды — встроенные символы), производные таблицы (проходимость, названия, группы палитры) пересобираются.
 * Без изменений набора версия рисунков не растёт.
 */
export function registerCaseTiles(c: { tiles?: CustomTile[]; legend?: Record<string, string> }) {
  const json = JSON.stringify([c.tiles ?? [], c.legend ?? null]);
  if (json === lastJson) return;
  lastJson = json;
  for (const key of custom) delete TILES[key];
  custom = [];
  const builtin = new Set(TILE_GROUPS.flatMap((g) => g.keys));
  for (const t of c.tiles ?? []) {
    if (builtin.has(t.key) || t.key in TILES) continue;
    TILES[t.key] = tileSpecOf(t);
    custom.push(t.key);
  }
  for (const ch of Object.keys(TILE_LEGEND)) delete TILE_LEGEND[ch];
  Object.assign(TILE_LEGEND, c.legend ?? DEFAULT_TILE_LEGEND);
  rebuildTileTables();
  bumpArtVersion();
}
