import { BASE_TILE, noise, rect, type Ctx } from "../common";
import floor from "./data/floor.json";
import wall from "./data/wall.json";

/** Прямоугольник тайла: (x, y, ширина, высота, цвет). */
export type TileRect = [x: number, y: number, w: number, h: number, color: string];
/** Правило шума: клетки пикселей, где шум больше `gt` (или меньше `lt`), закрашиваются; сработавшим считается первое правило. */
export interface NoiseRule {
  gt?: number;
  lt?: number;
  size: [w: number, h: number];
  color: string;
}
/** Узор вместо перечисления прямоугольников. */
export type TilePattern =
  /** Шахматка по номеру клетки на карте: заливка тайла одним из двух цветов. */
  | { checker: [a: string, b: string] }
  /** Шум по пикселям карты, шаг `step` пикселей. */
  | { noise: { step: number; rules: NoiseRule[] } }
  /** Шум на всю клетку: если он больше `gt`, рисуются `ops` (цветок на траве). */
  | { chance: { gt: number; ops: TileRect[] } }
  /** Доски: горизонтальные швы каждые `step` пикселей и вертикальные; в нечётных рядах клеток вертикальные сдвинуты на `shiftOdd`. */
  | { planks: { line: string; step: number; shiftOdd: number } };
export type TileOp = TileRect | TilePattern;

/** Класс соседней клетки: стена (`solid`), пол (`floor`), край карты (`edge`) или ключ тайла. */
export type Neighbor = string | string[];
export interface TileWhen {
  above?: Neighbor;
  below?: Neighbor;
  left?: Neighbor;
  right?: Neighbor;
}
/** Слой тайла: рисуется, если выполнено условие `when` по соседям (нет условия — всегда). Слои рисуются все подходящие, по порядку. */
export interface TileLayer {
  when?: TileWhen;
  ops: TileOp[];
}
export interface TileSpec {
  name: string;
  /** Непроходимая клетка (стена, окно, забор). */
  solid: boolean;
  /** Тайл, рисуемый под этим (окно — на стене, забор — на траве). */
  base?: string;
  /** `below`: если снизу проходимая клетка другого вида, под тайлом рисуется она, а не `base` (проём берёт пол коридора). */
  baseFrom?: "below";
  layers: TileLayer[];
}

/** Тайлы по ключам: встроенные, затем тайлы дела. */
export const TILES: Record<string, TileSpec> = {};
/** Группы тайлов для палитры: ключи по порядку. */
export const TILE_GROUPS: { id: string; label: string; keys: string[] }[] = [];

for (const [id, label, data] of [["floor", "Пол", floor], ["wall", "Стены", wall]] as const) {
  const keys = Object.keys(data);
  for (const key of keys) TILES[key] = (data as unknown as Record<string, TileSpec>)[key];
  TILE_GROUPS.push({ id, label, keys });
}

export interface TileNeighbors {
  below?: string;
  above?: string;
  left?: string;
  right?: string;
}

const solidKey = (key: string | undefined): boolean => !!key && !!TILES[key]?.solid;

/** Подходит ли соседний тайл (ключ или `undefined` за краем карты) под класс. */
function matches(key: string | undefined, want: Neighbor): boolean {
  return (Array.isArray(want) ? want : [want]).some((w) => (w === "edge" ? key === undefined : w === "solid" ? solidKey(key) : w === "floor" ? key !== undefined && !solidKey(key) : key === w));
}

const whenHolds = (when: TileWhen | undefined, n: TileNeighbors): boolean => !when || (Object.entries(when) as [keyof TileWhen, Neighbor][]).every(([side, want]) => matches(n[side], want));

function drawOp(ctx: Ctx, op: TileOp, ox: number, oy: number) {
  const T = BASE_TILE;
  if (Array.isArray(op)) return rect(ctx, ox + op[0], oy + op[1], op[2], op[3], op[4]);
  if ("checker" in op) return rect(ctx, ox, oy, T, T, ((ox + oy) / T) % 2 === 0 ? op.checker[0] : op.checker[1]);
  if ("noise" in op) {
    const { step, rules } = op.noise;
    for (let y = 0; y < T; y += step)
      for (let x = 0; x < T; x += step) {
        const n = noise(ox + x, oy + y);
        const hit = rules.find((r) => (r.gt !== undefined ? n > r.gt : n < (r.lt ?? -1)));
        if (hit) rect(ctx, ox + x, oy + y, hit.size[0], hit.size[1], hit.color);
      }
    return;
  }
  if ("chance" in op) {
    if (noise(ox, oy) > op.chance.gt) for (const r of op.chance.ops) rect(ctx, ox + r[0], oy + r[1], r[2], r[3], r[4]);
    return;
  }
  const { line, step, shiftOdd } = op.planks;
  const shift = (oy / T) % 2 === 0 ? 0 : shiftOdd;
  for (let y = 0; y < T; y += step) {
    rect(ctx, ox, oy + y, T, 1, line);
    rect(ctx, ox + ((shift + y * 2) % T), oy + y, 1, step, line);
  }
}

/** Нарисовать тайл по ключу: сначала `base`, затем все слои, чьё условие по соседям выполнено. Неизвестный ключ ничего не рисует. */
export function drawTileKey(ctx: Ctx, key: string, ox: number, oy: number, n: TileNeighbors, depth = 0) {
  const spec = TILES[key];
  if (!spec || depth > 4) return;
  if (spec.base) {
    const below = n.below;
    if (spec.baseFrom === "below" && below !== undefined && !solidKey(below) && below !== key) drawTileKey(ctx, below, ox, oy, {}, depth + 1);
    else drawTileKey(ctx, spec.base, ox, oy, n, depth + 1);
  }
  for (const layer of spec.layers) if (whenHolds(layer.when, n)) for (const op of layer.ops) drawOp(ctx, op, ox, oy);
}
