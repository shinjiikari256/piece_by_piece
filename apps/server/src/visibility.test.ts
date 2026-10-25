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

  it("«всем, включая гостей»: без входа виден только public; удаление дела", async () => {
    await addUser("nogroup", "student", null);
    await asAdmin();
    cookie = "";
    expect((await call("GET", "/public/cases")).json).toEqual([]);
    await asAdmin();
    await call("PUT", "/admin/cases/case-001/visibility", { mode: "public", groupIds: [] });
    await login("nogroup", "password123");
    expect((await call("GET", "/cases")).json.map((c: { id: string }) => c.id)).toContain("case-001");
    cookie = "";
    expect((await call("GET", "/public/cases")).json.map((c: { id: string }) => c.id)).toEqual(["case-001"]);
    expect((await call("GET", "/cases")).status).toBe(401);
    await asAdmin();
    expect((await call("DELETE", "/admin/cases/case-001")).status).toBe(200);
    expect((await call("GET", "/admin/cases/case-001")).status).toBe(404);
  });

  it("«никому»: студент дела не видит, привязки к группам сбрасываются", async () => {
    await addUser("ann", "student", groupA);
    await asAdmin();
    await call("PUT", "/admin/cases/case-001/visibility", { mode: "groups", groupIds: [groupA] });
    expect((await call("PUT", "/admin/cases/case-001/visibility", { mode: "none", groupIds: [groupA] })).json).toEqual({ mode: "none", groupIds: [] });
    await login("ann", "password123");
    expect((await call("GET", "/cases")).json.map((c: { id: string }) => c.id)).not.toContain("case-001");
    expect((await call("GET", "/cases/case-001")).status).toBe(404);
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
    // в общий список дело мероприятия не попадает, но своё мероприятие его показывает и даёт играть
    expect((await call("GET", "/cases")).json.map((c: { id: string }) => c.id)).not.toContain("case-001");
    const eventId = (await call("GET", "/events")).json[0].id;
    expect((await call("GET", `/cases?event=${eventId}`)).json.map((c: { id: string }) => c.id)).toEqual(["case-001"]);
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

describe("соавторы и проверка версии", () => {
  it("соавтор правит дело автора; чужой — нет; устаревшая версия — 409; админ в соавторах не хранится", async () => {
    const author = await addUser("author", "teacher", null);
    const coId = await addUser("coed", "teacher", null);
    await addUser("other", "teacher", null);
    await asAdmin();
    const base = (await call("GET", "/admin/cases/case-001")).json.caseFile;
    const adminId = (await db.select().from(schema.users).where(eq(schema.users.login, "admin")))[0].id;
    await login("author", "password123");
    const mine = { ...base, id: "coauth", number: "77", title: "Совместное" };
    const first = await call("PUT", "/admin/cases/coauth?rights=1", mine);
    expect(first.json.result).toBe("created");
    const v1 = first.json.versionId;
    const row = (await call("GET", "/admin/cases")).json.find((x: { id: string }) => x.id === "coauth");
    expect(row).toMatchObject({ canEdit: true, canManage: true });
    // админа и автора в соавторы не пишем
    expect((await call("PUT", "/admin/cases/coauth/editors", { userIds: [coId, adminId, author] })).json.editorIds).toEqual([coId]);
    // соавтор: правит, но не управляет
    await login("coed", "password123");
    const co = (await call("GET", "/admin/cases")).json.find((x: { id: string }) => x.id === "coauth");
    expect(co).toMatchObject({ canEdit: true, canManage: false });
    expect((await call("PUT", "/admin/cases/coauth/editors", { userIds: [] })).status).toBe(403);
    expect((await call("DELETE", "/admin/cases/coauth")).status).toBe(403);
    const edited = { ...mine, title: "Правка соавтора" };
    const second = await call("PUT", `/admin/cases/coauth?rights=1&base=${v1}`, edited);
    expect(second.json.result).toBe("created");
    // автор правил со старой версии — отказ
    await login("author", "password123");
    expect((await call("PUT", `/admin/cases/coauth?rights=1&base=${v1}`, { ...mine, title: "Моя" })).status).toBe(409);
    expect((await call("PUT", `/admin/cases/coauth?rights=1&base=${second.json.versionId}`, { ...mine, title: "Моя" })).json.result).toBe("created");
    // откат к прежнему содержимому делает его действующим
    const back = await call("PUT", "/admin/cases/coauth?rights=1", mine);
    expect(back.json.result).toBe("created");
    expect((await call("GET", "/admin/cases/coauth")).json.caseFile.title).toBe("Совместное");
    // посторонний преподаватель
    await login("other", "password123");
    expect((await call("PUT", "/admin/cases/coauth?rights=1", edited)).status).toBe(403);
    expect((await call("GET", "/admin/cases")).json.find((x: { id: string }) => x.id === "coauth")).toMatchObject({ canEdit: false, canManage: false });
  });
});

describe("API-токены", () => {
  it("токен читает и обновляет дело по ключу; остальное закрыто; отозванный — 401", async () => {
    await addUser("stud", "student", null);
    await login("stud", "password123");
    expect((await call("POST", "/admin/tokens", { name: "x" })).status).toBe(403);
    await asAdmin();
    const made = await call("POST", "/admin/tokens", { name: "Ассистент" });
    expect(made.status).toBe(201);
    const { id, token } = made.json;
    expect((await call("GET", "/admin/tokens")).json[0]).toMatchObject({ id, name: "Ассистент", revokedAt: null });
    cookie = "";
    const bearer = async (method: string, path: string, body?: unknown, t = token) => {
      const res = await app.request(`/api${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, json: await res.json().catch(() => null) };
    };
    const cur = (await bearer("GET", "/admin/cases/case-001")).json;
    expect(cur.caseFile.id).toBe("case-001");
    const put = await bearer("PUT", `/admin/cases/case-001?rights=1&base=${cur.versionId}`, { ...cur.caseFile, title: "Из токена" });
    expect(put.json.result).toBe("created");
    expect((await bearer("GET", "/admin/cases")).status).toBe(403);
    expect((await bearer("GET", "/admin/users")).status).toBe(403);
    expect((await bearer("POST", "/admin/tokens", { name: "y" })).status).toBe(403);
    expect((await bearer("GET", "/admin/cases/case-001", undefined, "wrong")).status).toBe(401);
    await asAdmin();
    expect((await call("DELETE", `/admin/tokens/${id}`)).status).toBe(200);
    expect((await bearer("GET", "/admin/cases/case-001")).status).toBe(401);
    const log = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "cases.save"));
    expect(log.some((l) => (l.payload as { viaToken?: boolean }).viaToken)).toBe(true);
  });
});
