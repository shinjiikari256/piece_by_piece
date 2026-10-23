import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { memoryDb } from "./db";

let app: ReturnType<typeof createApp>;
let cookie = "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ответы разных ручек, в тестах без схем
async function call(method: string, path: string, body?: unknown, withCookie = true): Promise<{ status: number; json: any }> {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", ...(withCookie && cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: res.status, json: await res.json().catch(() => null) };
}

const save = (savedAt: number, extra: Record<string, unknown> = {}) => ({ v: 1, caseId: "case-001", savedAt, hintsUsed: 0, ...extra });

const register = (login: string) => call("POST", "/auth/register", { login, fullName: `Студент ${login}`, password: "password123", consent: true });

beforeEach(async () => {
  app = createApp(await memoryDb(), { secureCookies: false, trustProxy: false });
  cookie = "";
  await register("ivanova");
});

describe("сохранения на сервере", () => {
  it("гостю — 401", async () => {
    expect((await call("GET", "/me/saves", undefined, false)).status).toBe(401);
    expect((await call("PUT", "/me/saves/case-001", save(1), false)).status).toBe(401);
  });

  it("записать, прочитать, список, стереть", async () => {
    expect((await call("GET", "/me/saves/case-001")).status).toBe(404);
    expect((await call("PUT", "/me/saves/case-001", save(100, { hintsUsed: 2 }))).json).toEqual({ result: "saved" });
    expect((await call("PUT", "/me/saves/case-002", save(200, { caseId: "case-002" }))).json).toEqual({ result: "saved" });
    expect((await call("GET", "/me/saves/case-001")).json).toMatchObject({ savedAt: 100, hintsUsed: 2 });
    expect((await call("GET", "/me/saves")).json.map((s: { caseId: string }) => s.caseId)).toEqual(["case-002", "case-001"]);
    await call("DELETE", "/me/saves/case-001");
    expect((await call("GET", "/me/saves/case-001")).status).toBe(404);
  });

  it("старое сохранение не затирает свежее", async () => {
    await call("PUT", "/me/saves/case-001", save(500, { hintsUsed: 3 }));
    expect((await call("PUT", "/me/saves/case-001", save(400, { hintsUsed: 0 }))).json).toEqual({ result: "stale" });
    expect((await call("GET", "/me/saves/case-001")).json.hintsUsed).toBe(3);
    expect((await call("PUT", "/me/saves/case-001", save(600, { hintsUsed: 4 }))).json).toEqual({ result: "saved" });
    expect((await call("GET", "/me/saves/case-001")).json.hintsUsed).toBe(4);
  });

  it("чужое дело в теле, мусор и слишком большое сохранение отклоняются", async () => {
    expect((await call("PUT", "/me/saves/case-002", save(1))).status).toBe(400);
    expect((await call("PUT", "/me/saves/case-001", "не json")).status).toBe(400);
    expect((await call("PUT", "/me/saves/case-001", { v: 1 })).status).toBe(400);
    expect((await call("PUT", "/me/saves/case-001", save(1, { junk: "x".repeat(600_000) }))).status).toBe(413);
  });

  it("сохранения у каждого игрока свои", async () => {
    await call("PUT", "/me/saves/case-001", save(100));
    cookie = "";
    await register("petrov");
    expect((await call("GET", "/me/saves")).json).toEqual([]);
    expect((await call("GET", "/me/saves/case-001")).status).toBe(404);
  });
});
