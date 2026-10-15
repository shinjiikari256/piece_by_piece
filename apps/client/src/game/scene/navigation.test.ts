import { describe, expect, it } from "vitest";
import { TILE } from "../art";
import { collides, findPath, nearestFree, reachWithin, slideShift } from "./navigation";

/** Карта из строк: `#` — стена, `.` — пол. */
const grid = (rows: string[]) => (x: number, y: number) => rows[y]?.[x] === ".";
const centerOf = (x: number, y: number) => ({ x: (x + 0.5) * TILE, y: (y + 1) * TILE - 2 });

describe("навигация в сцене", () => {
  const room = grid([
    "#######",
    "#..#..#",
    "#..#..#",
    "#.....#",
    "#######",
  ]);

  it("путь огибает перегородку и начинается со стартовой клетки", () => {
    const path = findPath(room, { x: 1, y: 1 }, [{ x: 5, y: 1 }])!;
    expect(path[0]).toEqual(centerOf(1, 1));
    expect(path.at(-1)).toEqual(centerOf(5, 1));
    expect(path.length).toBeGreaterThan(5); // через проём внизу
  });

  it("недостижимая или занятая цель — null", () => {
    expect(findPath(room, { x: 1, y: 1 }, [{ x: 3, y: 1 }])).toBeNull(); // стена
    const closed = grid(["#####", "#.#.#", "#####"]);
    expect(findPath(closed, { x: 1, y: 1 }, [{ x: 3, y: 1 }])).toBeNull();
  });

  it("клик по стене ведёт к ближайшим свободным клеткам", () => {
    expect(nearestFree(room, { x: 2, y: 1 })).toEqual([{ x: 2, y: 1 }]);
    const near = nearestFree(room, { x: 3, y: 1 });
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((t) => room(t.x, t.y))).toBe(true);
    expect(nearestFree(grid(["###", "###"]), { x: 1, y: 0 })).toEqual([]);
  });

  it("столкновения считаются по «ступням»", () => {
    const { x, y } = centerOf(1, 1);
    expect(collides(room, x, y)).toBe(false);
    expect(collides(room, 1.5 * TILE, y)).toBe(false);
    expect(collides(room, 0.4 * TILE, y)).toBe(true); // левая нога в стене
  });

  it("у проёма персонажа подтягивает к проходу", () => {
    // проём в стене сверху; персонаж стоит чуть правее него и упирается в стену
    const wall = grid(["##.##", "#...#", "#...#", "#####"]);
    const pos = { x: 3 * TILE, y: 1.2 * TILE };
    expect(collides(wall, pos.x, pos.y - 3)).toBe(true);
    expect(slideShift(wall, pos, "x", -3)).toBe(-3); // влево, к проёму, не больше шага
    expect(slideShift(grid(["#####", "#...#", "#####"]), { x: 2.5 * TILE, y: 1.2 * TILE }, "x", -3)).toBe(0); // подтягивать некуда
  });

  it("reachWithin: через стену недостижимо, вокруг — по числу шагов", () => {
    // две комнаты, между ними сплошная стена: клетки с той стороны стены рядом по прямой, но не по ходу
    const wall = grid(["#####", "#.#.#", "#.#.#", "#####"]);
    const near = reachWithin(wall, { x: 1, y: 1 }, 2);
    expect(near.has("1,2")).toBe(true);
    expect(near.has("3,1")).toBe(false); // за стеной
    // проход в стене — другая сторона достижима, но только в пределах лимита шагов
    const door = grid(["#####", "#...#", "#####"]);
    expect(reachWithin(door, { x: 1, y: 1 }, 2).has("3,1")).toBe(true);
    expect(reachWithin(door, { x: 1, y: 1 }, 1).has("3,1")).toBe(false);
  });
});
