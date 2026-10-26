import { describe, expect, it } from "vitest";
import { CHAR_H, CHAR_W } from "./characters";
import { PARTS, PART_NAMES, PART_ROLES, PART_SLOTS } from "./characters/parts";

describe("части персонажей из данных", () => {
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
});
