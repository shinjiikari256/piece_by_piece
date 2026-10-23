import { describe, expect, it } from "vitest";
import { TILE } from "../art";
import { BLOCK_LIMIT_MS, redirect, startWalk, stepWalk, tileOfPoint, turnBack, type Point, type Walk } from "./walker";

// коридор 6×3: стены вокруг, пол — всё остальное; blocked — клетки с помехой
const make =
  (blocked: Set<string> = new Set()) =>
  (x: number, y: number) =>
    x >= 0 && x < 6 && y >= 0 && y < 3 && !blocked.has(`${x},${y}`);
const pointOf = (x: number, y: number): Point => ({ x: (x + 0.5) * TILE, y: (y + 1) * TILE - 2 });

/** Шагать, пока ход не закончится или не выйдет время; возвращает событие и сколько мс прошло. */
function run(walk: Walk, pos: Point, isFree: (x: number, y: number) => boolean, limitMs = 20_000) {
  let t = 0;
  while (t < limitMs) {
    const r = stepWalk(walk, pos, 0.05, 150, isFree);
    t += 50;
    if (r.event) return { event: r.event, t };
  }
  return { event: undefined, t };
}

describe("ход персонажа", () => {
  it("нет пути — ход не начинается", () => {
    expect(startWalk(make(new Set(["1,0", "1,1", "1,2"])), { x: 0, y: 1 }, { x: 5, y: 1 })).toBeNull();
  });

  it("идёт по пути и приходит на клетку цели", () => {
    const free = make();
    const pos = pointOf(0, 1);
    const walk = startWalk(free, { x: 0, y: 1 }, { x: 5, y: 1 })!;
    const { event } = run(walk, pos, free);
    expect(event).toBe("arrived");
    expect(tileOfPoint(pos)).toEqual({ x: 5, y: 1 });
  });

  it("временная помеха: ждёт, обходит или дожидается и всё равно приходит", () => {
    const blocked = new Set(["2,1"]);
    const free = make(blocked);
    const pos = pointOf(0, 1);
    const walk = startWalk(make(), { x: 0, y: 1 }, { x: 5, y: 1 })!; // путь построен до помехи
    let released = false;
    let t = 0;
    let event;
    while (t < 20_000 && !event) {
      if (t >= 1000 && !released) {
        blocked.delete("2,1"); // игрок отошёл
        released = true;
      }
      event = stepWalk(walk, pos, 0.05, 150, free).event;
      t += 50;
    }
    expect(event).toBe("arrived");
    expect(tileOfPoint(pos)).toEqual({ x: 5, y: 1 });
  });

  it("помеха, перекрывшая весь проход, — через лимит ожидания «failed», потом возврат на исходную", () => {
    const blocked = new Set<string>();
    const free = make(blocked);
    const pos = pointOf(0, 1);
    const walk = startWalk(free, { x: 0, y: 1 }, { x: 5, y: 1 })!;
    // дошли до клетки 2, и проход (вся колонка x=3) закрылся
    while (tileOfPoint(pos).x < 2) stepWalk(walk, pos, 0.05, 150, free);
    for (const y of [0, 1, 2]) blocked.add(`3,${y}`);
    const failed = run(walk, pos, free);
    expect(failed.event).toBe("failed");
    expect(failed.t).toBeGreaterThanOrEqual(BLOCK_LIMIT_MS);
    expect(turnBack(walk, free, tileOfPoint(pos))).toBe(true);
    expect(run(walk, pos, free).event).toBe("arrived");
    expect(tileOfPoint(pos)).toEqual({ x: 0, y: 1 }); // вернулся туда, откуда начал
  });

  it("обратный путь тоже закрыт — «gaveUp», персонаж остаётся на месте", () => {
    const blocked = new Set<string>();
    const free = make(blocked);
    const pos = pointOf(0, 1);
    const walk = startWalk(free, { x: 0, y: 1 }, { x: 5, y: 1 })!;
    while (tileOfPoint(pos).x < 2) stepWalk(walk, pos, 0.05, 150, free);
    for (const y of [0, 1, 2]) blocked.add(`3,${y}`);
    expect(run(walk, pos, free).event).toBe("failed");
    blocked.clear();
    expect(turnBack(walk, free, tileOfPoint(pos))).toBe(true);
    for (const y of [0, 1, 2]) blocked.add(`1,${y}`); // закрылся и обратный проход
    expect(run(walk, pos, free).event).toBe("gaveUp");
    expect(tileOfPoint(pos).x).toBe(2);
  });

  it("повторная команда на ходу перестраивает путь от текущей клетки", () => {
    const free = make();
    const pos = pointOf(0, 1);
    const walk = startWalk(free, { x: 0, y: 1 }, { x: 5, y: 1 })!;
    while (tileOfPoint(pos).x < 2) stepWalk(walk, pos, 0.05, 150, free);
    expect(redirect(walk, free, tileOfPoint(pos), { x: 2, y: 0 })).toBe(true);
    expect(walk.origin).toEqual(tileOfPoint(pos));
    expect(run(walk, pos, free).event).toBe("arrived");
    expect(tileOfPoint(pos)).toEqual({ x: 2, y: 0 });
  });
});
