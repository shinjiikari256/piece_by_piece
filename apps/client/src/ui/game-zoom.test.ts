import { describe, expect, it } from "vitest";
import { stepZoom } from "./game-zoom";

describe("stepZoom", () => {
  it("кратный шагу масштаб переходит на соседний шаг", () => {
    expect(stepZoom(2, 1, 1.25)).toBe(3);
    expect(stepZoom(2, -1, 1.25)).toBe(1.25);
  });

  it("не кратный шагу масштаб (вписанный) приводится к ближайшему кратному в нужную сторону", () => {
    expect(stepZoom(2.19, 1, 1.25)).toBe(3);
    expect(stepZoom(2.19, -1, 1.25)).toBe(2);
    expect(stepZoom(1.6, 1, 1.25)).toBe(2);
  });

  it("не выходит за верхнюю границу и нижнюю границу минимума камеры", () => {
    expect(stepZoom(3, 1, 1.25)).toBe(3);
    expect(stepZoom(1.25, -1, 1.25)).toBe(1.25);
    expect(stepZoom(1.4, -1, 1.25)).toBe(1.25);
  });
});
