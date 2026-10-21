import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { CaseFile } from "../../../shared/case";
import { scoreCase } from "../../../shared/scoring";
import { createApp } from "./app";
import { ensureAdmin } from "./bootstrap";
import { seedCases } from "./cases";
import { memoryDb, schema, type Db } from "./db";

let db: Db;
let app: ReturnType<typeof createApp>;
let cookie = "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ответы разных ручек, в тестах без схем
async function call(method: string, path: string, body?: unknown, withCookie = true): Promise<{ status: number; json: any }> {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", ...(withCookie && cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: res.status, json: await res.json().catch(() => null) };
}

let full: CaseFile;

beforeEach(async () => {
  db = await memoryDb();
  app = createApp(db, { secureCookies: false, trustProxy: false });
  await ensureAdmin(db, "admin", "adminpass1");
  await seedCases(db);
  cookie = "";
  await call("POST", "/auth/register", { login: "ivanova", fullName: "Иванова", password: "password123", consent: true });
  const [row] = await db
    .select({ body: schema.caseVersions.body })
    .from(schema.cases)
    .innerJoin(schema.caseVersions, eq(schema.caseVersions.id, schema.cases.currentVersionId))
    .where(eq(schema.cases.id, "case-001"));
  full = row.body as CaseFile;
});

describe("судья на сервере", () => {
  it("гостю дела не отдаются", async () => {
    expect((await call("GET", "/cases", undefined, false)).status).toBe(401);
    expect((await call("GET", "/cases/case-001", undefined, false)).status).toBe(401);
  });

  it("список и дело — без ответов", async () => {
    const list = await call("GET", "/cases");
    expect(list.status).toBe(200);
    expect(list.json.map((c: { id: string }) => c.id)).toContain("case-001");

    const res = await call("GET", "/cases/case-001");
    expect(res.status).toBe(200);
    expect(res.json.caseVersionId).toBeGreaterThan(0);
    const text = JSON.stringify(res.json.caseFile);
    expect(text).not.toContain('"correct"');
    expect(text).not.toContain('"feedback"');
    expect(text).not.toContain(JSON.stringify(full.solution).slice(0, 80));
    for (const d of full.deductions) expect(text).not.toContain(d.conclusion);
    for (const h of full.hints) expect(text).not.toContain(h.text);
    expect((await call("GET", "/cases/nope")).status).toBe(404);
  });

  it("проверка сопоставления, подсказки и восстановление", async () => {
    const d = full.deductions[0];
    const good = d.options.find((o) => o.correct)!;
    const bad = d.options.find((o) => !o.correct)!;
    const ok = await call("POST", `/cases/case-001/deductions/${d.id}/check`, { optionId: good.id });
    expect(ok.json).toMatchObject({ correct: true, conclusion: d.conclusion });
    const no = await call("POST", `/cases/case-001/deductions/${d.id}/check`, { optionId: bad.id });
    expect(no.json.correct).toBe(false);
    expect(no.json.conclusion).toBeUndefined();
    expect((await call("POST", `/cases/case-001/deductions/${d.id}/check`, { optionId: "zzz" })).status).toBe(400);

    const h = full.hints[0];
    expect((await call("POST", `/cases/case-001/hints/${h.level}`)).json).toMatchObject({ text: h.text, penalty: h.penalty });
    expect((await call("POST", "/cases/case-001/hints/99")).status).toBe(400);

    const back = await call("POST", "/cases/case-001/restore", { deductionIds: [d.id], hintsUsed: 1 });
    expect(back.json.conclusions[d.id]).toBe(d.conclusion);
  });

  it("итог считает сервер, разбор открывается после сдачи", async () => {
    expect((await call("GET", "/cases/case-001/debrief")).status).toBe(403);
    const answers = Object.fromEntries(full.questions.map((q) => [q.id, [q.options[0].id]]));
    const fin = await call("POST", "/cases/case-001/finish", {
      answers, hintsUsed: 1, elapsedMs: 600_000, wrongDeductions: 2, importantEvidence: [],
      // поддельные баллы сервер не читает вообще
      total: 1000,
    });
    expect(fin.status).toBe(201);
    const expected = scoreCase(full, answers, 1, 600_000);
    expect(fin.json.score).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(fin.json.record).toMatchObject({ total: expected.total, hintsUsed: 1, wrongDeductions: 2 });

    const mine = await call("GET", "/me/results");
    expect(mine.json).toHaveLength(1);
    const [row] = await db.select().from(schema.results);
    expect(row.source).toBe("server");
    expect((await call("GET", "/cases/case-001/debrief")).json).toEqual(JSON.parse(JSON.stringify(full.solution)));
  });

  it("закреплённая версия проверяется по себе, а не по текущей", async () => {
    const { json } = await call("GET", "/cases/case-001");
    const d = full.deductions[0];
    const good = d.options.find((o) => o.correct)!;
    const changed: CaseFile = {
      ...full,
      deductions: full.deductions.map((x) => (x.id === d.id ? { ...x, options: x.options.map((o) => ({ ...o, correct: o.id !== good.id })) } : x)),
    };
    const { saveCaseVersion } = await import("./cases");
    await saveCaseVersion(db, changed);
    const pinned = await call("POST", `/cases/case-001/deductions/${d.id}/check?v=${json.caseVersionId}`, { optionId: good.id });
    expect(pinned.json.correct).toBe(true);
    const current = await call("POST", `/cases/case-001/deductions/${d.id}/check`, { optionId: good.id });
    expect(current.json.correct).toBe(false);
  });
});
