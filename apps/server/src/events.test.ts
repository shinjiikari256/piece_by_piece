import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { CaseFile } from "../../../shared/case";
import { createApp } from "./app";
import { ensureAdmin } from "./bootstrap";
import { seedCases } from "./cases";
import { memoryDb, schema, type Db } from "./db";

let db: Db;
let app: ReturnType<typeof createApp>;
let cookie = "";
let full: CaseFile;
let groupId: number;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ответы разных ручек, в тестах без схем
async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: res.status, json: await res.json().catch(() => null) };
}
const asAdmin = () => call("POST", "/auth/login", { login: "admin", password: "adminpass1" });
const asStudent = () => call("POST", "/auth/login", { login: "ivanova", password: "password123" });
const day = 86_400_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
const answersOf = () => Object.fromEntries(full.questions.map((q) => [q.id, [q.options[0].id]]));

beforeEach(async () => {
  db = await memoryDb();
  app = createApp(db, { secureCookies: false, trustProxy: false });
  await ensureAdmin(db, "admin", "adminpass1");
  await seedCases(db);
  cookie = "";
  await call("POST", "/auth/register", { login: "ivanova", fullName: "Иванова", password: "password123", consent: true });
  [{ id: groupId }] = await db.insert(schema.groups).values({ name: "Группа А" }).returning();
  await db.update(schema.users).set({ groupId, status: "active" }).where(eq(schema.users.login, "ivanova"));
  const [row] = await db
    .select({ body: schema.caseVersions.body })
    .from(schema.cases)
    .innerJoin(schema.caseVersions, eq(schema.caseVersions.id, schema.cases.currentVersionId))
    .where(eq(schema.cases.id, "case-001"));
  full = row.body as CaseFile;
  cookie = "";
});

async function makeEvent(extra: Record<string, unknown> = {}) {
  await asAdmin();
  const res = await call("POST", "/admin/events", { title: "Зачёт", caseIds: ["case-001"], groupIds: [groupId], ...extra });
  expect(res.status).toBe(201);
  await asStudent();
  return res.json;
}
const play = async (eventId: number, finish = true) => {
  const a = await call("POST", "/cases/case-001/attempts", { eventId });
  if (a.status !== 200 || !finish) return a;
  await call("POST", `/attempts/${a.json.attemptId}/start`, {});
  return call("POST", `/attempts/${a.json.attemptId}/finish`, { answers: answersOf(), importantEvidence: [] });
};

describe("мероприятия", () => {
  it("студент видит только мероприятия своей группы; создаёт и правит персонал", async () => {
    const ev = await makeEvent({ debriefPolicy: "never", maxScoredAttempts: 2 });
    expect(ev).toMatchObject({ title: "Зачёт", caseIds: ["case-001"], groupIds: [groupId], open: true, debriefPolicy: "never", maxScoredAttempts: 2 });
    const mine = await call("GET", "/events");
    expect(mine.json).toHaveLength(1);
    expect((await call("POST", "/admin/events", { title: "x", caseIds: ["case-001"] })).status).toBe(403);
    await db.update(schema.users).set({ groupId: null }).where(eq(schema.users.login, "ivanova"));
    expect((await call("GET", "/events")).json).toEqual([]);

    await asAdmin();
    expect((await call("PUT", `/admin/events/${ev.id}`, { title: "Новое", caseIds: ["case-001"], groupIds: [] })).json).toMatchObject({ title: "Новое", groupIds: [] });
    expect((await call("POST", "/admin/events", { title: "x", caseIds: ["nope"] })).status).toBe(400);
    expect((await call("POST", "/admin/events", { title: "x", caseIds: ["case-001"], opensAt: iso(day), closesAt: iso(0) })).status).toBe(400);
    expect((await call("DELETE", `/admin/events/${ev.id}`)).status).toBe(200);
    expect((await call("GET", "/events")).json).toEqual([]);
  });

  it("попытка в мероприятии: окно времени, группа и число зачётных попыток", async () => {
    const closed = await makeEvent({ opensAt: iso(day), closesAt: iso(2 * day) });
    expect((await play(closed.id, false)).json.error).toBe("event_closed");

    await asAdmin();
    const other = (await call("POST", "/admin/events", { title: "Чужое", caseIds: ["case-001"], groupIds: [] })).json;
    await asStudent();
    expect((await play(other.id, false)).status).toBe(404);

    const ev = await makeEvent({ maxScoredAttempts: 1 });
    const first = await play(ev.id);
    expect(first.status).toBe(201);
    expect((await db.select().from(schema.results))[0].eventId).toBe(ev.id);
    expect((await play(ev.id, false)).json.error).toBe("attempts_exhausted");
    expect((await call("GET", "/events")).json.find((e: { id: number }) => e.id === ev.id).doneByCase).toEqual({ "case-001": 1 });
    // свободная игра не затронута
    expect((await call("POST", "/cases/case-001/attempts", {})).status).toBe(200);
  });

  it("разбор по правилам мероприятия", async () => {
    const never = await makeEvent({ debriefPolicy: "never" });
    const done = await play(never.id);
    expect(done.json.debrief).toBeNull();
    expect((await call("GET", "/cases/case-001/debrief")).status).toBe(403);
    // повторная сдача тоже не раскрывает
    expect((await call("POST", `/attempts/${(await db.select().from(schema.attempts))[0].id}/finish`, { answers: {}, importantEvidence: [] })).json.debrief).toBeNull();

    // после закрытия: закрывается — разбор открывается
    const later = await makeEvent({ debriefPolicy: "after_close", closesAt: iso(day) });
    await db.delete(schema.results);
    expect((await play(later.id)).json.debrief).toBeNull();
    expect((await call("GET", "/cases/case-001/debrief")).status).toBe(403);
    await db.update(schema.events).set({ closesAt: new Date(Date.now() - 1000) }).where(eq(schema.events.id, later.id));
    expect((await call("GET", "/cases/case-001/debrief")).json).toEqual(JSON.parse(JSON.stringify(full.solution)));

    // свободная игра раскрывает сразу
    const free = await call("POST", "/cases/case-001/attempts", {});
    await call("POST", `/attempts/${free.json.attemptId}/start`, {});
    const fin = await call("POST", `/attempts/${free.json.attemptId}/finish`, { answers: answersOf(), importantEvidence: [] });
    expect(fin.json.debrief).not.toBeNull();
  });
});
