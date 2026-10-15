import { TILE } from "../art";
import { findPath, type IsFree, type Tile } from "./navigation";

/**
 * Ход персонажа к клетке (эффект `moveTo`): чистая логика без Phaser.
 * Путь строится при команде; если на пути встала помеха (игрок, закрытая дверь, другой человек), персонаж ждёт и пересчитывает путь;
 * не дождавшись за `BLOCK_LIMIT_MS`, идёт обратно на клетку, с которой начал; если и обратно нельзя — остаётся на месте.
 */

/** Сколько ждём заблокированный путь, мс. */
export const BLOCK_LIMIT_MS = 3000;
const REPLAN_MS = 400;

export interface Point {
  x: number;
  y: number;
}

export interface Walk {
  phase: "out" | "back";
  /** Клетка, с которой началась команда: сюда возвращаемся, если дойти нельзя. */
  origin: Tile;
  /** Куда идём «туда»: клетка цели или клетка выхода, если персонаж уходит из локации. */
  goal: Tile;
  leaving: boolean;
  /** Что скажет персонаж, если не дойдёт. */
  failText?: string;
  /** Оставшиеся точки пути (низ-центр клетки, как у `findPath`), без стартовой. */
  path: Point[];
  blockedMs: number;
  replanMs: number;
}

/** Чем кончился ход: дошёл; путь закрыт «туда» (пора возвращаться); путь закрыт и «обратно» (остаётся). */
export type WalkEvent = "arrived" | "failed" | "gaveUp";

export const tileOfPoint = (p: Point): Tile => ({ x: Math.floor(p.x / TILE), y: Math.floor((p.y - 2) / TILE) });

/** Начать ход к клетке (или к ближайшей из нескольких); null — до цели сейчас не дойти. */
export function startWalk(isFree: IsFree, from: Tile, goal: Tile | Tile[], opts: { leaving?: boolean; failText?: string } = {}): Walk | null {
  const goals = Array.isArray(goal) ? goal : [goal];
  const path = findPath(isFree, from, goals);
  if (!path) return null;
  // из нескольких целей (клетки области-выхода) выбрана ближайшая достижимая: конец пути
  const end = tileOfPoint(path[path.length - 1]);
  return { phase: "out", origin: from, goal: end, leaving: !!opts.leaving, failText: opts.failText, path: path.slice(1), blockedMs: 0, replanMs: 0 };
}

/** Повернуть ход назад, на исходную клетку; false — обратный путь закрыт. */
export function turnBack(walk: Walk, isFree: IsFree, from: Tile): boolean {
  const path = findPath(isFree, from, [walk.origin]);
  if (!path) return false;
  walk.phase = "back";
  walk.path = path.slice(1);
  walk.blockedMs = 0;
  walk.replanMs = 0;
  return true;
}

/** Новая цель посреди хода (ещё один `moveTo`): путь строится от текущей клетки, возврат — на неё же. */
export function redirect(walk: Walk, isFree: IsFree, from: Tile, goal: Tile, opts: { leaving?: boolean; failText?: string } = {}): boolean {
  const path = findPath(isFree, from, [goal]);
  if (!path) return false;
  Object.assign(walk, { phase: "out", origin: from, goal, leaving: !!opts.leaving, failText: opts.failText, path: path.slice(1), blockedMs: 0, replanMs: 0 });
  return true;
}

/**
 * Один шаг по пути: сдвигает `pos` (низ-центр спрайта) на `speed * dt`.
 * Возвращает, сдвинулся ли персонаж, и событие, если ход закончился.
 */
export function stepWalk(walk: Walk, pos: Point, dt: number, speed: number, isFree: IsFree): { moved: boolean; event?: WalkEvent } {
  const next = walk.path[0];
  if (!next) return { moved: false, event: "arrived" };
  const here = tileOfPoint(pos);
  const there = tileOfPoint(next);
  if ((there.x !== here.x || there.y !== here.y) && !isFree(there.x, there.y)) {
    walk.blockedMs += dt * 1000;
    walk.replanMs += dt * 1000;
    if (walk.replanMs >= REPLAN_MS) {
      walk.replanMs = 0;
      const path = findPath(isFree, here, [walk.phase === "out" ? walk.goal : walk.origin]);
      if (path) {
        walk.path = path.slice(1);
        walk.blockedMs = 0;
        return { moved: false };
      }
    }
    if (walk.blockedMs >= BLOCK_LIMIT_MS) return { moved: false, event: walk.phase === "out" ? "failed" : "gaveUp" };
    return { moved: false };
  }
  walk.blockedMs = 0;
  const dx = next.x - pos.x;
  const dy = next.y - pos.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  if (dist <= step) {
    pos.x = next.x;
    pos.y = next.y;
    walk.path.shift();
    return { moved: true, event: walk.path.length ? undefined : "arrived" };
  }
  pos.x += (dx / dist) * step;
  pos.y += (dy / dist) * step;
  return { moved: true };
}
