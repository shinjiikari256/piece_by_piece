import { describe, expect, it } from "vitest";
import { formatColor, hexToHsv, hsvToHex, parseColor, pushRecent } from "./color-math";

describe("color-math", () => {
  it("hex ↔ hsv возвращает тот же цвет", () => {
    for (const c of ["#000000", "#ffffff", "#ff0000", "#3a7bd5", "#808080", "#12ab9f"]) expect(hsvToHex(hexToHsv(c))).toBe(c);
  });

  it("форматы записываются и разбираются обратно", () => {
    expect(formatColor("#ff8000", "rgb")).toBe("rgb(255, 128, 0)");
    expect(formatColor("#ff0000", "hsl")).toBe("hsl(0, 100%, 50%)");
    for (const c of ["#ff8000", "#3a7bd5", "#000000"]) for (const f of ["hex", "rgb", "hsl"] as const) expect(parseColor(formatColor(c, f))).toBeTruthy();
    expect(parseColor("rgb(255, 128, 0)")).toBe("#ff8000");
    expect(parseColor("hsl(120, 100%, 25%)")).toBe("#008000");
  });

  it("принимает короткий код и «r, g, b», отвергает мусор", () => {
    expect(parseColor("#F80")).toBe("#ff8800");
    expect(parseColor("255 0 0")).toBe("#ff0000");
    expect(parseColor("красный")).toBeNull();
    expect(parseColor("#12345")).toBeNull();
  });

  it("недавние цвета: без повторов, новый первым, не больше предела", () => {
    expect(pushRecent(["#111111", "#222222"], "#222222")).toEqual(["#222222", "#111111"]);
    expect(pushRecent(["#111111", "#222222", "#333333"], "#444444", 3)).toEqual(["#444444", "#111111", "#222222"]);
  });
});
