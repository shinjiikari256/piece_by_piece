import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "./app";
import { ensureAdmin } from "./bootstrap";
import { seedCases } from "./cases";
import { memoryDb, schema, type Db } from "./db";

let db: Db;
let app: ReturnType<typeof createApp>;
let cookie = "";
let groupA: number;
let groupB: number;

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
const login = (name: string, password: string) => call("POST", "/auth/login", { login: name, password });
const asAdmin = () => login("admin", "adminpass1");

async function addUser(name: string, role: "student" | "teacher", groupId: number | null) {
  cookie = "";
  await call("POST", "/auth/register", { login: name, fullName: name, password: "password123", consent: true });
  await db.update(schema.users).set({ role, groupId, status: "active" }).where(eq(schema.users.login, name));
  const [u] = await db.select().from(schema.users).where(eq(schema.users.login, name));
  return u.id;
}

beforeEach(async () => {
  db = await memoryDb();
  app = createApp(db, { secureCookies: false, trustProxy: false });
  await ensureAdmin(db, "admin", "adminpass1");
  await seedCases(db);
  [{ id: groupA }, { id: groupB }] = await db
    .insert(schema.groups)
    .values([{ name: "Группа А" }, { name: "Группа Б" }])
    .returning();
});

describe("видимость дела по группам", () => {
  it("«только группам»: список, дело и попытка — только своей группе", async () => {
    await addUser("ann", "student", groupA);
    await addUser("bob", "student", groupB);
    await addUser("nogroup", "student", null);
    await asAdmin();
    expect((await call("GET", "/admin/cases/case-001/visibility")).json).toEqual({ mode: "all", groupIds: [], lockedGroupIds: [] });
    expect((await call("PUT", "/admin/cases/case-001/visibility", { mode: "groups", groupIds: [groupA] })).status).toBe(200);

    await login("ann", "password123");
    expect((await call("GET", "/cases")).json.map((c: { id: string }) => c.id)).toContain("case-001");
    expect((await call("GET", "/cases/case-001")).status).toBe(200);
    expect((await call("POST", "/cases/case-001/attempts", {})).status).toBe(200);

    for (const name of ["bob", "nogroup"]) {
      await login(name, "password123");
      expect((await call("GET", "/cases")).json.map((c: { id: string }) => c.id)).not.toContain("case-001");
      expect((await call("GET", "/cases/case-001")).status).toBe(404);
      expect((await call("POST", "/cases/case-001/attempts", {})).status).toBe(404);
    }
  });

  it("снятая видимость закрывает новые попытки, начатую можно закончить", async () => {
    await addUser("ann", "student", groupA);
    await asAdmin();
    await call("PUT", "/admin/cases/case-001/visibility", { mode: "groups", groupIds: [groupA] });
    await login("ann", "password123");
    expect((await call("POST", "/cases/case-001/attempts", {})).status).toBe(200);
    await asAdmin();
    await call("PUT", "/admin/cases/case-001/visibility", { mode: "groups", groupIds: [groupB] });
    await login("ann", "password123");
    expect((await call("GET", "/cases")).json.map((c: { id: string }) => c.id)).not.toContain("case-001");
    expect((await call("POST", "/cases/case-001/attempts", {})).status).toBe(200);
    expect((await call("POST", "/cases/case-001/attempts", { fresh: true })).status).toBe(404);
  });

  it("дело мероприятия группа видит независимо от видимости", async () => {
    await addUser("ann", "student", groupA);
    await asAdmin();
    await call("PUT", "/admin/cases/case-001/visibility", { mode: "groups", groupIds: [groupB] });
    expect((await call("POST", "/admin/events", { title: "Зачёт", caseIds: ["case-001"], groupIds: [groupA] })).status).toBe(201);
    await login("ann", "password123");
    expect((await call("GET", "/cases")).json.map((c: { id: string }) => c.id)).toContain("case-001");
    expect((await call("GET", "/cases/case-001")).status).toBe(200);
  });

  it("преподаватель выбирает только свои группы, чужие в списке остаются", async () => {
    const teacher = await addUser("tina", "teacher", null);
    await db.insert(schema.groupTeachers).values({ groupId: groupA, userId: teacher });
    await db.insert(schema.cases).values({ id: "mine" });
    await db.insert(schema.caseVersions).values({ caseId: "mine", body: {}, formatVersion: 1, contentHash: "x", createdBy: teacher });
    await asAdmin();
    await call("PUT", "/admin/cases/mine/visibility", { mode: "groups", groupIds: [groupB] });
    const [{ id: groupC }] = await db.insert(schema.groups).values({ name: "Группа В" }).returning();

    await login("tina", "password123");
    expect((await call("GET", "/admin/cases/mine/visibility")).json).toEqual({ mode: "groups", groupIds: [groupB], lockedGroupIds: [groupB] });
    expect((await call("PUT", "/admin/cases/mine/visibility", { mode: "groups", groupIds: [groupB, groupA] })).json.groupIds.sort()).toEqual([groupA, groupB].sort());
    expect((await call("PUT", "/admin/cases/mine/visibility", { mode: "groups", groupIds: [] })).json.groupIds).toEqual([groupB]);
    expect((await call("PUT", "/admin/cases/mine/visibility", { mode: "groups", groupIds: [groupA, 999] })).status).toBe(400);
    expect((await call("PUT", "/admin/cases/mine/visibility", { mode: "groups", groupIds: [groupC] })).status).toBe(403);
    expect((await call("PUT", "/admin/cases/case-001/visibility", { mode: "all", groupIds: [] })).status).toBe(403);
  });

  it("студенту ручки видимости недоступны", async () => {
    await addUser("ann", "student", groupA);
    await login("ann", "password123");
    expect((await call("PUT", "/admin/cases/case-001/visibility", { mode: "all", groupIds: [] })).status).toBe(403);
  });
});
