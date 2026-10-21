import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../server/src/app";
import { memoryDb } from "../../../server/src/db";
import { api } from "./account";
import { createMemoryPlatform } from "./memory-platform";
import { createOnlinePlatform } from "./online-platform";
import type { SaveData } from "./save-data";

type NewSave = Omit<SaveData, "v" | "savedAt" | "player">;

const save = (caseId: string, hintsUsed = 0): NewSave => ({
  caseId,
  screen: "play",
  progress: { collected: [], deductions: [], characterNotes: {}, flags: [], counters: {}, enums: {}, chosen: [], followers: [], fired: [], npcPlaces: {} } as unknown as SaveData["progress"],
  examined: [],
  usedChoices: [],
  wrongDeductions: 0,
  playerNotes: "",
  hintsUsed,
  answers: {},
  locationId: "l1",
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const app = createApp(await memoryDb(), { secureCookies: false, trustProxy: false });
  let cookie = "";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const res = await app.request(url, { ...init, headers: { ...(init.headers as object), ...(cookie ? { cookie } : {}) } });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  });
  await api("POST", "/auth/register", { login: "student1", fullName: "Студент", password: "password123", consent: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OnlinePlatform", () => {
  it("запись идёт на сервер с задержкой, а с другого устройства читается", async () => {
    const a = createOnlinePlatform(createMemoryPlatform(), () => true);
    await a.saves.write(save("case-001", 2));
    expect(await api<unknown[]>("GET", "/me/saves")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3100);
    expect(await api<unknown[]>("GET", "/me/saves")).toHaveLength(1);

    const b = createOnlinePlatform(createMemoryPlatform(), () => true);
    expect((await b.saves.read("case-001"))?.hintsUsed).toBe(2);
    expect((await b.saves.list()).map((s) => s.caseId)).toEqual(["case-001"]);
  });

  it("пауза отправляет сохранение сразу, стирание — и с сервера", async () => {
    const p = createOnlinePlatform(createMemoryPlatform(), () => true);
    await p.saves.write(save("case-001"));
    await p.saves.markPaused("case-001");
    expect(await api<{ pausedAt?: number }>("GET", "/me/saves/case-001")).toMatchObject({ pausedAt: expect.any(Number) });
    await p.saves.clear("case-001");
    expect(await api<unknown[]>("GET", "/me/saves")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await api<unknown[]>("GET", "/me/saves"), "отложенная отправка стёртого не воскрешает").toHaveLength(0);
  });

  it("локальная копия новее серверной — остаётся локальная; без входа сервер не трогаем", async () => {
    const local = createMemoryPlatform();
    const p = createOnlinePlatform(local, () => true);
    await p.saves.write(save("case-001", 1));
    await p.saves.markPaused("case-001");
    vi.setSystemTime(Date.now() + 10_000);
    await local.saves.write(save("case-001", 5));
    expect((await p.saves.read("case-001"))?.hintsUsed).toBe(5);

    const guest = createOnlinePlatform(createMemoryPlatform(), () => false);
    await guest.saves.write(save("case-002"));
    await vi.advanceTimersByTimeAsync(5000);
    expect((await api<unknown[]>("GET", "/me/saves")).map((s) => (s as SaveData).caseId)).toEqual(["case-001"]);
  });

  it("сервер недоступен — игра продолжает с локальной копией", async () => {
    const p = createOnlinePlatform(createMemoryPlatform(), () => true);
    await p.saves.write(save("case-001", 3));
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    expect((await p.saves.read("case-001"))?.hintsUsed).toBe(3);
    expect(await p.saves.list()).toHaveLength(1);
    await p.saves.markPaused("case-001");
  });
});
