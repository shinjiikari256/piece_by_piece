import { TILE } from "../art";

/** Клетка карты. */
export interface Tile {
  x: number;
  y: number;
}

/** Можно ли встать на клетку (не стена, не мебель, не человек, не запертая дверь). */
export type IsFree = (x: number, y: number) => boolean;

/** Размер «ступней» персонажа для столкновений, px. */
export const FEET_W = 18;
export const FEET_H = 10;

/**
 * Клик по стене, мебели или декорации: идём к ближайшим свободным клеткам рядом.
 * Возвращает все свободные клетки на минимальном расстоянии — путь выберет достижимую.
 */
export function nearestFree(isFree: IsFree, t: Tile): Tile[] {
  if (isFree(t.x, t.y)) return [t];
  for (let r = 1; r <= 4; r++) {
    const ring: Tile[] = [];
    for (let dx = -r; dx <= r; dx++)
      for (const dy of [r - Math.abs(dx), -(r - Math.abs(dx))]) {
        if (isFree(t.x + dx, t.y + dy) && !ring.some((p) => p.x === t.x + dx && p.y === t.y + dy)) ring.push({ x: t.x + dx, y: t.y + dy });
      }
    if (ring.length) return ring;
  }
  return [];
}

/**
 * Поиск в ширину по клеткам до ближайшей из целей. Возвращает путь точками «стопы по центру клетки»
 * (первая точка — стартовая клетка) или null, если цель недостижима.
 */
export function findPath(isFree: IsFree, start: Tile, goals: Tile[]): { x: number; y: number }[] | null {
  const goalSet = new Set(goals.filter((g) => isFree(g.x, g.y)).map((g) => `${g.x},${g.y}`));
  if (!goalSet.size) return null;
  const prev = new Map<string, string | null>([[`${start.x},${start.y}`, null]]);
  const queue = [start];
  let found: string | null = null;
  while (queue.length) {
    const cur = queue.shift()!;
    const key = `${cur.x},${cur.y}`;
    if (goalSet.has(key)) {
      found = key;
      break;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = `${nx},${ny}`;
      if (!prev.has(nk) && isFree(nx, ny)) {
        prev.set(nk, key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  if (!found) return null;
  const path: { x: number; y: number }[] = [];
  for (let k: string | null = found; k; k = prev.get(k) ?? null) {
    const [x, y] = k.split(",").map(Number);
    path.unshift({ x: (x + 0.5) * TILE, y: (y + 1) * TILE - 2 });
  }
  return path;
}

/** Упирается ли персонаж, стоящий ногами в точке (x, y), в несвободную клетку. */
export function collides(isFree: IsFree, x: number, y: number): boolean {
  const left = Math.floor((x - FEET_W / 2) / TILE);
  const right = Math.floor((x + FEET_W / 2 - 1) / TILE);
  const top = Math.floor((y - FEET_H) / TILE);
  const bottom = Math.floor((y - 1) / TILE);
  for (let ty = top; ty <= bottom; ty++) for (let tx = left; tx <= right; tx++) if (!isFree(tx, ty)) return true;
  return false;
}

/**
 * Упёрлись в стену рядом с проёмом — на сколько подтянуть вдоль стены (по оси `axis`) к проходу,
 * чтобы не приходилось целиться в дверь пиксель в пиксель. 0 — подтягивать некуда.
 */
export function slideShift(isFree: IsFree, pos: { x: number; y: number }, axis: "x" | "y", push: number): number {
  const step = Math.abs(push);
  for (let offset = 1; offset <= TILE * 0.6; offset++) {
    for (const sign of [-1, 1]) {
      const x = axis === "x" ? pos.x + sign * offset : pos.x + push;
      const y = axis === "y" ? pos.y + sign * offset : pos.y + push;
      const shifted = axis === "x" ? [pos.x + sign * offset, pos.y] : [pos.x, pos.y + sign * offset];
      if (!collides(isFree, x, y) && !collides(isFree, shifted[0], shifted[1])) return sign * Math.min(step, offset);
    }
  }
  return 0;
}
