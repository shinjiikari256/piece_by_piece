import { describe, expect, it } from "vitest";
import { FLOOR_GROUPS, FLOOR_TILES, TILE_NAMES, WALL_GROUPS, WALL_TILES } from "./tiles";

describe("подгруппы клеток в палитре", () => {
  const chars = (gs: { chars: string[] }[]) => gs.flatMap((g) => g.chars);

  it("каждая клетка пола и стен — ровно в одной подгруппе", () => {
    expect([...chars(FLOOR_GROUPS)].sort()).toEqual([...FLOOR_TILES].sort());
    expect([...chars(WALL_GROUPS)].sort()).toEqual([...WALL_TILES].sort());
  });

  it("у каждой клетки есть русское название", () => {
    for (const ch of [...FLOOR_TILES, ...WALL_TILES]) expect(TILE_NAMES[ch], ch).toBeTruthy();
  });
});
