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

  const open = async (fresh = false) => (await call("POST", "/cases/case-001/attempts", fresh ? { fresh: true } : {})).json;
  const set = (id: string, patch: object) => db.update(schema.attempts).set(patch).where(eq(schema.attempts.id, id));
  const row = async (id: string) => (await db.select().from(schema.attempts).where(eq(schema.attempts.id, id)))[0];
  const events = async (id: string) => (await db.select().from(schema.attemptEvents).where(eq(schema.attemptEvents.attemptId, id))).map((e) => e.type);
  const answersOf = () => Object.fromEntries(full.questions.map((q) => [q.id, [q.options[0].id]]));

  it("попытка: создаётся, дело без ответов, повторное открытие возвращает ту же", async () => {
    const a = await open();
    expect(a).toMatchObject({ started: false, hintsUsed: 0, wrongDeductions: 0, elapsedMs: null });
    expect(JSON.stringify(a.caseFile)).not.toContain('"correct"');
    expect((await open()).attemptId).toBe(a.attemptId);
    expect((await call("POST", "/cases/nope/attempts", {})).status).toBe(404);
    expect((await call("POST", "/cases/case-001/attempts", {}, false)).status).toBe(401);
  });

  it("время: идёт от /start, на паузе стоит, возвращение без паузы вычитает время вне игры", async () => {
    const a = await open();
    expect((await call("POST", `/attempts/${a.attemptId}/start`, {})).status).toBe(200);
    const t0 = (await row(a.attemptId)).startedAt!;
    await call("POST", `/attempts/${a.attemptId}/start`, {});
    expect((await row(a.attemptId)).startedAt).toEqual(t0);

    // закрыли вкладку без паузы: 10 минут вне игры не засчитываются
    const past = new Date(Date.now() - 600_000);
    await set(a.attemptId, { startedAt: new Date(past.getTime() - 60_000), lastEventAt: past });
    const back = await open();
    expect(back.elapsedMs).toBeGreaterThanOrEqual(59_000);
    expect(back.elapsedMs).toBeLessThan(120_000);

    await call("POST", `/attempts/${a.attemptId}/pause`, {});
    const paused = (await row(a.attemptId)).pausedAt;
    expect(paused).not.toBeNull();
    expect(await events(a.attemptId)).toEqual(expect.arrayContaining(["start", "resume", "pause"]));
  });

  it("проверка сопоставления считает ошибки на сервере, подсказки идут по порядку и идемпотентны", async () => {
    const { attemptId } = await open();
    const d = full.deductions[0];
    const good = d.options.find((o) => o.correct)!;
    const bad = d.options.find((o) => !o.correct)!;
    const chk = (optionId: string) => call("POST", `/attempts/${attemptId}/deductions/${d.id}/check`, { optionId });
    expect((await chk(good.id)).json).toMatchObject({ correct: true, conclusion: d.conclusion });
    const no = await chk(bad.id);
    expect(no.json.correct).toBe(false);
    expect(no.json.conclusion).toBeUndefined();
    expect((await chk("zzz")).status).toBe(400);
    expect((await row(attemptId)).wrongDeductions).toBe(1);

    const sorted = [...full.hints].sort((x, y) => x.level - y.level);
    expect((await call("POST", `/attempts/${attemptId}/hints/${sorted[1].level}`)).status).toBe(400);
    const first = await call("POST", `/attempts/${attemptId}/hints/${sorted[0].level}`);
    expect(first.json).toMatchObject({ text: sorted[0].text, penalty: sorted[0].penalty });
    await call("POST", `/attempts/${attemptId}/hints/${sorted[0].level}`);
    expect((await row(attemptId)).hintsUsed).toBe(1);
    expect((await call("POST", `/attempts/${attemptId}/hints/99`)).status).toBe(400);

    const back = await call("GET", `/attempts/${attemptId}/revealed`);
    expect(back.json).toMatchObject({ hintsUsed: 1, wrongDeductions: 1 });
    expect(back.json.conclusions[d.id]).toBe(d.conclusion);
  });

  it("не больше 10 проверок в минуту на попытку", async () => {
    const { attemptId } = await open();
    const d = full.deductions[0];
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await call("POST", `/attempts/${attemptId}/deductions/${d.id}/check`, { optionId: d.options[0].id })).status);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it("итог считает сервер по данным попытки; подделка подсказок и времени игнорируется, повторная сдача идемпотентна", async () => {
    expect((await call("GET", "/cases/case-001/debrief")).status).toBe(403);
    const { attemptId } = await open();
    await call("POST", `/attempts/${attemptId}/start`, {});
    await call("POST", `/attempts/${attemptId}/hints/${full.hints[0].level}`);
    await set(attemptId, { startedAt: new Date(Date.now() - 600_000) });
    const answers = answersOf();
    const fin = await call("POST", `/attempts/${attemptId}/finish`, { answers, importantEvidence: [], hintsUsed: 0, elapsedMs: 1, total: 1000 });
    expect(fin.status).toBe(201);
    const elapsed = fin.json.record.elapsedMs as number;
    expect(Math.abs(elapsed - 600_000)).toBeLessThan(5_000);
    expect(fin.json.score).toEqual(JSON.parse(JSON.stringify(scoreCase(full, answers, 1, elapsed))));
    expect(fin.json.record).toMatchObject({ hintsUsed: 1, wrongDeductions: 0 });

    const again = await call("POST", `/attempts/${attemptId}/finish`, { answers, importantEvidence: [] });
    expect(again.json.score).toEqual(fin.json.score);
    expect(again.json.record.id).toBe(fin.json.record.id);
    expect(await db.select().from(schema.results)).toHaveLength(1);
    const [res] = await db.select().from(schema.results);
    expect(res).toMatchObject({ source: "server", attemptId });
    expect((await call("GET", "/me/results")).json).toHaveLength(1);
    expect((await call("GET", "/cases/case-001/debrief")).json).toEqual(JSON.parse(JSON.stringify(full.solution)));
    // закрытая попытка не принимает действий
    expect((await call("POST", `/attempts/${attemptId}/hints/${full.hints[0].level}`)).status).toBe(409);
  });

  it("fresh закрывает начатую попытку как reset; старая без событий 30 дней — abandoned; обе вне статистики", async () => {
    const a = await open();
    const b = await open(true);
    expect(b.attemptId).not.toBe(a.attemptId);
    expect(await row(a.attemptId)).toMatchObject({ status: "reset", excludedFromStats: true });
    expect(await events(a.attemptId)).toContain("reset");

    await set(b.attemptId, { lastEventAt: new Date(Date.now() - 31 * 86_400_000) });
    const c = await open();
    expect(c.attemptId).not.toBe(b.attemptId);
    expect(await row(b.attemptId)).toMatchObject({ status: "abandoned", excludedFromStats: true });
  });

  it("чужая попытка недоступна", async () => {
    const { attemptId } = await open();
    cookie = "";
    await call("POST", "/auth/register", { login: "petrov", fullName: "Петров", password: "password123", consent: true });
    expect((await call("POST", `/attempts/${attemptId}/hints/1`)).status).toBe(404);
    expect((await call("GET", `/attempts/${attemptId}/revealed`)).status).toBe(404);
    expect((await call("POST", `/attempts/${attemptId}/finish`, { answers: {}, importantEvidence: [] })).status).toBe(404);
  });

  it("попытка закреплена за версией дела", async () => {
    const a = await open();
    const d = full.deductions[0];
    const good = d.options.find((o) => o.correct)!;
    const changed: CaseFile = {
      ...full,
      deductions: full.deductions.map((x) => (x.id === d.id ? { ...x, options: x.options.map((o) => ({ ...o, correct: o.id !== good.id })) } : x)),
    };
    const { saveCaseVersion } = await import("./cases");
    await saveCaseVersion(db, changed);
    const pinned = await call("POST", `/attempts/${a.attemptId}/deductions/${d.id}/check`, { optionId: good.id });
    expect(pinned.json.correct).toBe(true);
    // новая попытка берёт текущую версию
    const fresh = await open(true);
    expect(fresh.caseVersionId).not.toBe(a.caseVersionId);
    const current = await call("POST", `/attempts/${fresh.attemptId}/deductions/${d.id}/check`, { optionId: good.id });
    expect(current.json.correct).toBe(false);
  });
});
