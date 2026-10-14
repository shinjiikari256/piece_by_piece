import { describe, expect, it } from "vitest";
import { pickTheme } from "./theme";

describe("выбор темы", () => {
  it("параметр адреса включает тему и запоминает её", () => {
    expect(pickTheme("salad", null)).toEqual({ theme: "salad", save: true, clear: false });
    expect(pickTheme("salad", "other")).toEqual({ theme: "salad", save: true, clear: false });
  });

  it("без параметра берётся сохранённая тема", () => {
    expect(pickTheme(null, "salad")).toEqual({ theme: "salad", save: false, clear: false });
  });

  it("default сбрасывает тему и стирает сохранённую", () => {
    expect(pickTheme("default", "salad")).toEqual({ theme: null, save: false, clear: true });
  });

  it("неизвестное имя игнорируется: остаётся сохранённая или обычная", () => {
    expect(pickTheme("neon", "salad")).toEqual({ theme: "salad", save: false, clear: false });
    expect(pickTheme("neon", null)).toEqual({ theme: null, save: false, clear: false });
    expect(pickTheme(null, "neon")).toEqual({ theme: null, save: false, clear: false });
  });
});
