import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { ensureAdmin } from "./bootstrap";
import { seedCases } from "./cases";
import { memoryDb } from "./db";

let app: ReturnType<typeof createApp>;
let cookie = "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ответы разных ручек, в тестах без схем
async function call(method: string, path: string, body?: unknown): Promise<{ status: number; res: Response; json: any }> {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return {
    status: res.status,
    res,
    json: await res
      .clone()
      .json()
      .catch(() => null),
  };
}

beforeEach(async () => {
  const db = await memoryDb();
  const dir = await mkdtemp(path.join(tmpdir(), "offline-"));
  await writeFile(path.join(dir, "game.html"), "<html><head><title>Игра</title></head><body></body></html>");
  app = createApp(db, { secureCookies: false, trustProxy: false, offlineDir: dir });
  await ensureAdmin(db, "admin", "adminpass1");
  await seedCases(db);
  cookie = "";
});

describe("офлайн-версия", () => {
  it("только персоналу; доступны собранные варианты", async () => {
    expect((await call("GET", "/admin/offline")).status).toBe(401);
    await call("POST", "/auth/login", { login: "admin", password: "adminpass1" });
    expect((await call("GET", "/admin/offline")).json).toEqual({ variants: ["game"] });
  });

  it("вшивает выбранные дела в шаблон; нет шаблона или дела — 404", async () => {
    await call("POST", "/auth/login", { login: "admin", password: "adminpass1" });
    const ok = await call("POST", "/admin/offline", { variant: "game", caseIds: ["case-001"] });
    expect(ok.status).toBe(200);
    const html = await ok.res.text();
    expect(html).toContain('id="cases"');
    expect(html).toContain("case-001");
    expect(html).not.toContain("case-002");
    expect((await call("POST", "/admin/offline", { variant: "editor", caseIds: ["case-001"] })).status).toBe(404);
    expect((await call("POST", "/admin/offline", { variant: "game", caseIds: ["нет-такого"] })).status).toBe(404);
    expect((await call("POST", "/admin/offline", { variant: "game", caseIds: [] })).status).toBe(400);
  });
});
