import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasGuestData, listKeys, moveGuestDataToUser, readJson, setStorageScope, writeJson } from "./storage";

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

beforeEach(() => void vi.stubGlobal("localStorage", fakeStorage()));
afterEach(() => {
  setStorageScope(null);
  vi.unstubAllGlobals();
});

describe("данные игрока по учётным записям", () => {
  it("сохранения и результаты у каждого свои, настройки устройства общие", () => {
    writeJson("save:case-001", { who: "guest" });
    writeJson("theme", "salad");
    setStorageScope(5);
    expect(readJson("save:case-001", null)).toBeNull();
    expect(listKeys("save:")).toEqual([]);
    writeJson("save:case-001", { who: "u5" });
    writeJson("results", [1]);
    expect(listKeys("save:")).toEqual(["save:case-001"]);
    expect(readJson("theme", "")).toBe("salad");
    setStorageScope(6);
    expect(readJson("save:case-001", null)).toBeNull();
    expect(readJson("results", [])).toEqual([]);
    setStorageScope(null);
    expect(readJson("save:case-001", null)).toEqual({ who: "guest" });
    expect(listKeys("save:")).toEqual(["save:case-001"]);
  });

  it("данные гостя переносятся вошедшему, не затирая его собственные", () => {
    writeJson("save:a", { who: "guest" });
    writeJson("save:b", { who: "guest" });
    setStorageScope(5);
    writeJson("save:b", { who: "u5" });
    setStorageScope(null);
    expect(hasGuestData()).toBe(true);
    moveGuestDataToUser(5);
    expect(hasGuestData()).toBe(false);
    setStorageScope(5);
    expect(readJson("save:a", null)).toEqual({ who: "guest" });
    expect(readJson("save:b", null)).toEqual({ who: "u5" });
  });
});
