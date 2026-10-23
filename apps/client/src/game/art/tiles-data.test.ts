import { describe, expect, it } from "vitest";
import { drawTile, TILE_LEGEND } from "./tiles";
import { drawTileLegacy } from "./legacy-tile";
import { TILES } from "./tiles/model";

type Rect = [number, number, number, number, string];
function record(draw: (ctx: never) => void): Rect[] {
  const out: Rect[] = [];
  let color = "";
  draw({
    set fillStyle(v: string) {
      color = v;
    },
    fillRect: (x: number, y: number, w: number, h: number) => out.push([x, y, w, h, color]),
  } as never);
  return out;
}

const CHARS = Object.keys(TILE_LEGEND);
const SIDES = [undefined, ...CHARS];

describe("тайлы из данных", () => {
  it("рисуют так же, как прежний код, при любых соседях и положениях", () => {
    let n = 0;
    for (const ch of CHARS)
      for (const below of SIDES)
        for (const left of SIDES)
          for (const right of [undefined, "#", ".", "S", "D"])
            for (const [ox, oy] of [
              [0, 0],
              [16, 0],
              [0, 16],
              [48, 32],
              [208, 112],
            ]) {
              const nb = { below, left, right, above: below };
              expect(
                record((c) => drawTile(c, ch, ox, oy, nb)),
                `${ch} ${JSON.stringify(nb)} ${ox},${oy}`,
              ).toEqual(record((c) => drawTileLegacy(c, ch, ox, oy, nb)));
              n++;
            }
    expect(n).toBeGreaterThan(10000);
  }, 60_000);

  it("у каждого тайла есть название, ссылки base ведут на существующие тайлы", () => {
    for (const [key, t] of Object.entries(TILES)) {
      expect(t.name, key).toBeTruthy();
      if (t.base) expect(TILES[t.base], `${key}.base`).toBeDefined();
    }
  });
});
