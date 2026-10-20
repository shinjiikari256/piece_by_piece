import type { CaseFile, CustomTile } from "../../../../../shared/case";
import { DEFAULT_TILE_LEGEND, TILES, TILE_GROUPS } from "../../game/art";
import { uniqueKey } from "./helpers";

export type TileOp = CustomTile["layers"][number]["ops"][number];
export type TileLayer = CustomTile["layers"][number];

export const isBuiltinTile = (key: string): boolean => TILE_GROUPS.some((g) => g.keys.includes(key));

/** Легенда дела (у дела без своей — встроенные символы). */
export const legendOf = (d: Pick<CaseFile, "legend">): Record<string, string> => d.legend ?? { ...DEFAULT_TILE_LEGEND };

/** Тайл для показа: тайл дела или встроенный, приведённый к виду тайла дела. */
export function tileView(d: Pick<CaseFile, "tiles">, key: string): CustomTile | null {
  const own = d.tiles?.find((t) => t.key === key);
  if (own) return own;
  const spec = TILES[key];
  if (!spec || !isBuiltinTile(key)) return null;
  return JSON.parse(JSON.stringify({ key, ...spec })) as CustomTile;
}

/** Группы палитры тайлов: встроенные, затем «Свои». */
export const tileGroups = (d: Pick<CaseFile, "tiles">): { id: string; label: string; keys: string[] }[] => [
  ...TILE_GROUPS,
  ...(d.tiles?.length ? [{ id: "own", label: "Свои", keys: d.tiles.map((t) => t.key) }] : []),
];

const CANDIDATES = [..."0123456789", ..."abcdefghijklmnopqrstuvwxyz", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."!@%&*+=:;~^?"];
/** Первый свободный символ легенды. */
export const freeChar = (legend: Record<string, string>): string | null => CANDIDATES.find((c) => !(c in legend)) ?? null;

/** Символы легенды, которые ведут на тайл. */
export const charsOf = (d: Pick<CaseFile, "legend">, key: string): string[] => Object.entries(legendOf(d)).filter(([, k]) => k === key).map(([c]) => c);

/** Назначить тайлу единственный символ (прежние символы тайла освобождаются). Занятый другим тайлом символ — отказ (`null`). */
export function setTileChar<T extends Pick<CaseFile, "legend">>(d: T, key: string, ch: string): T | null {
  const legend = legendOf(d);
  if (ch.length !== 1) return null;
  if (legend[ch] && legend[ch] !== key) return null;
  const next = Object.fromEntries(Object.entries(legend).filter(([, k]) => k !== key));
  next[ch] = key;
  return { ...d, legend: next };
}

/** Где тайл стоит на картах («локация»), и какие тайлы берут его основой. */
export function tileUses(d: Pick<CaseFile, "legend" | "locations" | "tiles">, key: string): string[] {
  const chars = new Set(charsOf(d, key));
  const onMaps = d.locations.filter((l) => l.tiles.some((row) => [...row].some((c) => chars.has(c)))).map((l) => `карта «${l.name}»`);
  const bases = (d.tiles ?? []).filter((t) => t.base === key).map((t) => `основа тайла «${t.name}»`);
  return [...onMaps, ...bases];
}

export function newTile<T extends Pick<CaseFile, "tiles" | "legend">>(d: T): { draft: T; tile: CustomTile } | null {
  const legend = legendOf(d);
  const ch = freeChar(legend);
  if (!ch) return null;
  const tile: CustomTile = { key: uniqueKey("tile", (k) => k in TILES || !!d.tiles?.some((t) => t.key === k)), name: "Новый тайл", solid: false, layers: [{ ops: [] }] };
  return { tile, draft: { ...d, tiles: [...(d.tiles ?? []), tile], legend: { ...legend, [ch]: tile.key } } };
}

export function copyTile<T extends Pick<CaseFile, "tiles" | "legend">>(d: T, src: CustomTile): { draft: T; tile: CustomTile } | null {
  const legend = legendOf(d);
  const ch = freeChar(legend);
  if (!ch) return null;
  const { key: _k, ...rest } = JSON.parse(JSON.stringify(src)) as CustomTile;
  const tile: CustomTile = { ...rest, key: uniqueKey(`${src.key}_copy`, (k) => k in TILES || !!d.tiles?.some((t) => t.key === k)), name: `${src.name} (копия)` };
  return { tile, draft: { ...d, tiles: [...(d.tiles ?? []), tile], legend: { ...legend, [ch]: tile.key } } };
}

export const removeTile = <T extends Pick<CaseFile, "tiles" | "legend">>(d: T, key: string): T => ({
  ...d,
  tiles: d.tiles?.filter((t) => t.key !== key),
  legend: Object.fromEntries(Object.entries(legendOf(d)).filter(([, k]) => k !== key)),
});

export const patchTile = <T extends Pick<CaseFile, "tiles">>(d: T, key: string, patch: Partial<CustomTile>): T => ({
  ...d,
  tiles: d.tiles?.map((t) => (t.key === key ? { ...t, ...patch } : t)),
});

export const setLayerOps = (d: CaseFile, key: string, layer: number, ops: TileOp[]): CaseFile =>
  patchTile(d, key, { layers: (d.tiles?.find((t) => t.key === key)?.layers ?? []).map((l, i) => (i === layer ? { ...l, ops } : l)) });

export const patchLayer = (d: CaseFile, key: string, layer: number, patch: Partial<TileLayer>): CaseFile =>
  patchTile(d, key, { layers: (d.tiles?.find((t) => t.key === key)?.layers ?? []).map((l, i) => (i === layer ? { ...l, ...patch } : l)) });

/** Короткое описание условия слоя: «сверху стена, слева пол». */
const SIDE_NAMES = { above: "сверху", below: "снизу", left: "слева", right: "справа" } as const;
const CLASS_NAMES: Record<string, string> = { solid: "стена", floor: "пол", edge: "край карты" };
export function describeWhen(when: TileLayer["when"]): string {
  const parts = (Object.keys(SIDE_NAMES) as (keyof typeof SIDE_NAMES)[])
    .filter((s) => when?.[s] !== undefined)
    .map((s) => `${SIDE_NAMES[s]} ${[when![s]!].flat().map((v) => CLASS_NAMES[v] ?? v).join(" или ")}`);
  return parts.length ? parts.join(", ") : "всегда";
}

/** Верхний из прямоугольников слоя, покрывающий пиксель (для ластика и пипетки). */
export function topRectAt(ops: TileOp[], x: number, y: number): number {
  for (let i = ops.length - 1; i >= 0; i--) {
    const o = ops[i];
    if (Array.isArray(o) && x >= o[0] && x < o[0] + o[2] && y >= o[1] && y < o[1] + o[3]) return i;
  }
  return -1;
}
