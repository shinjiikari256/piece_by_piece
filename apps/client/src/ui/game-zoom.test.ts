import { describe, expect, it } from "vitest";
import { stepZoom } from "./zoom-control";

const MAX = 3;

describe("stepZoom", () => {
  it("кратный шагу масштаб переходит на соседний шаг (10%)", () => {
    expect(stepZoom(2, 1, 1.25, MAX)).toBe(2.1);
    expect(stepZoom(2, -1, 1.25, MAX)).toBe(1.9);
  });

  it("не кратный шагу масштаб (вписанный) приводится к ближайшему кратному в нужную сторону", () => {
    expect(stepZoom(2.17, 1, 1.25, MAX)).toBe(2.2);
    expect(stepZoom(2.17, -1, 1.25, MAX)).toBe(2.1);
    expect(stepZoom(1.66, 1, 1.25, MAX)).toBe(1.7);
    expect(stepZoom(1.66, -1, 1.25, MAX)).toBe(1.6);
  });

  it("не выходит за верхнюю границу и нижнюю границу минимума камеры", () => {
    expect(stepZoom(3, 1, 1.25, MAX)).toBe(3);
    expect(stepZoom(1.25, -1, 1.25, MAX)).toBe(1.25);
    expect(stepZoom(1.27, -1, 1.25, MAX)).toBe(1.25);
  });

  it("редактор карты: минимум 100%, шаг тот же", () => {
    expect(stepZoom(1, 1, 1, MAX)).toBe(1.1);
    expect(stepZoom(1, -1, 1, MAX)).toBe(1);
    expect(stepZoom(3, 1, 1, MAX)).toBe(3);
  });
});
