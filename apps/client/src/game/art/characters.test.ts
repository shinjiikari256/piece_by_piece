import { describe, expect, it } from "vitest";
import { CHAR_FRAMES, CHAR_H, CHAR_W, LOOKS, drawCharacter, lookFromCustom, type Look } from "./characters";
import { drawCharacterLegacy } from "./legacy-character";
import { PARTS, PART_NAMES, PART_ROLES, PART_SLOTS } from "./characters/parts";

type Rect = [number, number, number, number, string];

function record(draw: (ctx: never) => void): Rect[] {
  const out: Rect[] = [];
  let color = "";
  draw({
    set fillStyle(v: string) {
      color = v;
    },
    fillRect: (x: number, y: number, w: number, h: number) => out.push([x, y, w, h, color]),
    clearRect: () => undefined,
  } as never);
  return out;
}

/** Цвет → [r, g, b, a]: `#rrggbb[aa]` и `rgba()` приводятся к одному виду. */
function rgba(c: string): number[] {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(c);
  if (m) return [+m[1], +m[2], +m[3], +m[4] * 255];
  const n = c.slice(1);
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)).concat(n.length > 6 ? parseInt(n.slice(6, 8), 16) : 255);
}

function expectSame(a: Rect[], b: Rect[], label: string) {
  expect(b.length, `${label}: число прямоугольников`).toBe(a.length);
  a.forEach((r, i) => {
    expect(b[i].slice(0, 4), `${label} #${i}`).toEqual(r.slice(0, 4));
    const ca = rgba(r[4]);
    const cb = rgba(b[i][4]);
    for (let k = 0; k < 4; k++) expect(Math.abs(ca[k] - cb[k]), `${label} #${i} цвет`).toBeLessThanOrEqual(1);
  });
}

const BASE: Look = {
  skin: "#e0a070", hair: "#3a2a1a", hairStyle: "short", top: "#4f7fbf", topShade: "#3f6aa3", accent: "#c0392b", accentStyle: "tie",
  legs: "#2b3a55", shoes: "#1d2229",
};

describe("части персонажей из данных", () => {
  it("каждый готовый облик рисуется так же, как прежним кодом, во всех позах", () => {
    for (const [name, look] of Object.entries(LOOKS)) {
      for (const frame of CHAR_FRAMES) {
        expectSame(record((c) => drawCharacterLegacy(c, look, frame, 5)), record((c) => drawCharacter(c, look, frame, 5)), `${name}/${frame}`);
      }
    }
  });

  it("все сочетания причёски, детали, очков, усов, бороды и юбки совпадают с прежней отрисовкой", () => {
    let n = 0;
    for (const hairStyle of Object.keys(PARTS.hair))
      for (const accentStyle of Object.keys(PARTS.accent))
        for (const bits of [0, 1, 2, 3, 4, 5, 6, 7])
          for (const bottom of ["pants", "skirt"] as const) {
            const look = { ...BASE, hairStyle, accentStyle, glasses: !!(bits & 1), mustache: !!(bits & 2), beard: !!(bits & 4), bottom, eyes: "#334455" } as Look;
            for (const frame of CHAR_FRAMES) {
              expectSame(record((c) => drawCharacterLegacy(c, look, frame, 0)), record((c) => drawCharacter(c, look, frame, 0)), `${hairStyle}/${accentStyle}/${bits}/${bottom}/${frame}`);
              n++;
            }
          }
    expect(n).toBeGreaterThan(3000);
  });

  it("части не выходят за клетку персонажа, роли цвета известны, у каждой части есть название", () => {
    for (const slot of PART_SLOTS) {
      for (const [key, spec] of Object.entries(PARTS[slot])) {
        expect(PART_NAMES[slot][key], `${slot}/${key} название`).toBeTruthy();
        expect(Array.isArray(spec.frames.default), `${slot}/${key} кадр default`).toBe(true);
        for (const [frame, ops] of Object.entries(spec.frames)) {
          for (const [x, y, w, h, c] of ops) {
            expect(x, `${slot}/${key}/${frame} x`).toBeGreaterThanOrEqual(0);
            expect(y, `${slot}/${key}/${frame} y`).toBeGreaterThanOrEqual(0);
            expect(x + w, `${slot}/${key}/${frame} правый край`).toBeLessThanOrEqual(CHAR_W);
            expect(y + h, `${slot}/${key}/${frame} низ`).toBeLessThanOrEqual(CHAR_H);
            if (c?.startsWith("$")) expect(PART_ROLES as readonly string[], `${slot}/${key} роль ${c}`).toContain(c);
          }
        }
      }
    }
  });

  it("свою внешность рисует так же, как её готовый вид", () => {
    const l = lookFromCustom({ ...BASE, glasses: false, mustache: false, beard: false } as never);
    expectSame(record((c) => drawCharacterLegacy(c, l, "idle", 0)), record((c) => drawCharacter(c, l, "idle", 0)), "custom");
  });
});
