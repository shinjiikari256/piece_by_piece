import { beforeEach, describe, expect, it } from "vitest";
import type { AdminGroup, AdminUser, JoinLink, Me } from "../../../shared/api";
import { createApp } from "./app";
import { ensureAdmin } from "./bootstrap";
import { memoryDb, schema, type Db } from "./db";

type App = ReturnType<typeof createApp>;

/** Клиент с «браузерной» cookie сессии. */
function client(app: App) {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = /nr_sid=;|Max-Age=0/.test(set) ? "" : set.split(";")[0];
    const json = await res.json().catch(() => null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ответы разных ручек, в тестах без схем
    return { status: res.status, json: json as any };
  };
  return {
    get: (p: string) => call("GET", p),
    post: (p: string, b?: unknown) => call("POST", p, b ?? {}),
    patch: (p: string, b: unknown) => call("PATCH", p, b),
    put: (p: string, b: unknown) => call("PUT", p, b),
    del: (p: string) => call("DELETE", p),
    get cookie() {
      return cookie;
    },
  };
}

const reg = (login: string, extra: Record<string, unknown> = {}) => ({
  login,
  fullName: `Студент ${login}`,
  password: "password123",
  consent: true,
  ...extra,
});

let db: Db;
let app: App;
let admin: ReturnType<typeof client>;

beforeEach(async () => {
  db = await memoryDb();
  app = createApp(db, { secureCookies: false, trustProxy: false });
  expect(await ensureAdmin(db, "Admin", "adminpass1")).toBe("created");
  expect(await ensureAdmin(db, "other", "x")).toBe("exists");
  admin = client(app);
  expect((await admin.post("/auth/login", { login: "admin", password: "adminpass1" })).status).toBe(200);
});

describe("регистрация и вход", () => {
  it("свободная регистрация: студент без группы, не подтверждён, сразу вошёл", async () => {
    const s = client(app);
    const r = await s.post("/auth/register", reg("Ivanova"));
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ login: "ivanova", role: "student", status: "pending", group: null } satisfies Partial<Me>);
    expect((await s.get("/me")).json.login).toBe("ivanova");
  });

  it("логин уникален без учёта регистра; без согласия и с коротким паролем — нельзя", async () => {
    const s = client(app);
    await s.post("/auth/register", reg("petrov"));
    expect((await client(app).post("/auth/register", reg("PETROV"))).json.error).toBe("login_taken");
    expect((await client(app).post("/auth/register", reg("sidorov", { consent: false }))).status).toBe(400);
    const short = await client(app).post("/auth/register", reg("sidorov", { password: "123" }));
    expect(short.json.message).toMatch(/от 8 символов/);
  });

  it("неверный пароль — 401, выход завершает сессию, заблокированный не входит", async () => {
    const s = client(app);
    const { json: me } = await s.post("/auth/register", reg("kozlov"));
    await s.post("/auth/logout");
    expect((await s.get("/me")).status).toBe(401);
    expect((await s.post("/auth/login", { login: "kozlov", password: "wrong-pass" })).status).toBe(401);
    expect((await s.post("/auth/login", { login: "KOZLOV", password: "password123" })).status).toBe(200);

    await admin.patch("/admin/users", { ids: [me.id], set: { status: "blocked" } });
    expect((await s.get("/me")).status, "сессия заблокированного больше не действует").toBe(401);
    expect((await s.post("/auth/login", { login: "kozlov", password: "password123" })).json.error).toBe("blocked");
  });

  it("частые попытки входа ограничены", async () => {
    const s = client(app);
    for (let i = 0; i < 5; i++) await s.post("/auth/login", { login: "nobody", password: "xxxxxxxx" });
    expect((await s.post("/auth/login", { login: "nobody", password: "xxxxxxxx" })).status).toBe(429);
  });

  it("регистрацию можно закрыть", async () => {
    expect((await admin.put("/admin/settings", { registrationOpen: false })).status).toBe(200);
    expect((await client(app).post("/auth/register", reg("late"))).json.error).toBe("registration_closed");
  });
});

describe("пароли", () => {
  it("смена своего пароля требует старый и завершает другие сессии", async () => {
    const a = client(app);
    await a.post("/auth/register", reg("smirnova"));
    const b = client(app);
    await b.post("/auth/login", { login: "smirnova", password: "password123" });
    expect((await a.post("/me/password", { oldPassword: "nope", newPassword: "newpassword1" })).json.error).toBe("bad_password");
    expect((await a.post("/me/password", { oldPassword: "password123", newPassword: "newpassword1" })).status).toBe(200);
    expect((await a.get("/me")).status).toBe(200);
    expect((await b.get("/me")).status, "второе устройство вышло").toBe(401);
  });

  it("сброс преподавателем: временный пароль, при входе — обязательная смена без старого", async () => {
    const s = client(app);
    const { json: me } = await s.post("/auth/register", reg("orlov"));
    const { json } = await admin.post(`/admin/users/${me.id}/reset-password`);
    expect(json.password).toMatch(/^[A-Za-z2-9]{10}$/);
    expect((await s.get("/me")).status, "сброс завершает сессии").toBe(401);

    const login = await s.post("/auth/login", { login: "orlov", password: json.password });
    expect(login.json.mustChangePassword).toBe(true);
    expect((await s.get("/me")).status).toBe(200);
    expect((await s.post("/me/password", { newPassword: "mynewpass1" })).json.mustChangePassword).toBe(false);

    const manual = await admin.post(`/admin/users/${me.id}/reset-password`, { password: "dictated-1" });
    expect(manual.json.password).toBe("dictated-1");
  });
});

describe("группы, ссылки, права преподавателя", () => {
  async function setup() {
    const g1 = (await admin.post("/admin/groups", { name: "ЮР-201" })).json;
    const g2 = (await admin.post("/admin/groups", { name: "ЮР-202" })).json;
    const teacher = client(app);
    const { json: t } = await teacher.post("/auth/register", reg("teacher"));
    await admin.patch("/admin/users", { ids: [t.id], set: { role: "teacher", status: "active" } });
    await admin.patch(`/admin/groups/${g1.id}`, { name: "ЮР-201", teacherIds: [t.id] });
    return { g1, g2, teacher, t };
  }

  it("регистрация по ссылке ставит группу, статус — не подтверждён; «подтвердить всех из ссылки»", async () => {
    const { g1, teacher } = await setup();
    const { json: auto } = (await teacher.post(`/admin/groups/${g1.id}/links`)) as { json: JoinLink };
    expect(auto.autoApprove, "по умолчанию подтверждает сразу").toBe(true);
    expect((await client(app).post("/auth/register", reg("sidorov", { joinToken: auto.token }))).json).toMatchObject({ status: "active", group: { id: g1.id } });

    const { json: link } = (await teacher.post(`/admin/groups/${g1.id}/links`, { autoApprove: false })) as { json: JoinLink };
    expect(link.expiresAt, "без даты — бессрочная").toBeNull();
    expect((await client(app).get(`/join/${link.token}`)).json.group.name).toBe("ЮР-201");

    const s = client(app);
    const r = await s.post("/auth/register", reg("vasina", { joinToken: link.token }));
    expect(r.json).toMatchObject({ status: "pending", group: { id: g1.id } });
    await client(app).post("/auth/register", reg("lomov", { joinToken: link.token }));

    const links = (await teacher.get(`/admin/groups/${g1.id}/links`)).json as JoinLink[];
    expect(links.find((l) => l.id === link.id)).toMatchObject({ registered: 2, pending: 2, autoApprove: false });
    expect((await teacher.post(`/admin/links/${link.id}/confirm`)).json.confirmed).toBe(2);
    expect((await s.get("/me")).json.status).toBe("active");

    await teacher.post(`/admin/links/${link.id}/revoke`);
    expect((await client(app).get(`/join/${link.token}`)).status).toBe(404);
    expect((await client(app).post("/auth/register", reg("late", { joinToken: link.token }))).json.error).toBe("invalid_link");
  });

  it("истёкшая ссылка не действует", async () => {
    const { g1 } = await setup();
    const { json: link } = await admin.post(`/admin/groups/${g1.id}/links`, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await client(app).get(`/join/${link.token}`)).status).toBe(404);
  });

  it("преподаватель видит студентов своих групп и без группы; меняет статус и группу, но не роль и не чужих", async () => {
    const { g1, g2, teacher, t } = await setup();
    const free = (await client(app).post("/auth/register", reg("free"))).json as Me;
    const other = (await client(app).post("/auth/register", reg("other"))).json as Me;
    await admin.patch("/admin/users", { ids: [other.id], set: { groupId: g2.id } });

    const visible = ((await teacher.get("/admin/users")).json as AdminUser[]).map((u) => u.login);
    expect(visible).toContain("free");
    expect(visible).not.toContain("other");
    expect(visible, "сотрудников преподаватель не видит").not.toContain("admin");

    expect((await teacher.patch("/admin/users", { ids: [free.id], set: { groupId: g1.id, status: "active" } })).status).toBe(200);
    expect((await teacher.patch("/admin/users", { ids: [free.id], set: { groupId: g2.id } })).json.error).toBe("forbidden");
    expect((await teacher.patch("/admin/users", { ids: [other.id], set: { status: "active" } })).json.error).toBe("forbidden");
    expect((await teacher.patch("/admin/users", { ids: [free.id], set: { role: "teacher" } })).json.error).toBe("forbidden");
    expect((await teacher.post(`/admin/users/${other.id}/reset-password`)).status).toBe(404);
    const own = await teacher.post("/admin/groups", { name: "ЮР-301" });
    expect(own.status, "преподаватель создаёт группу и становится её преподавателем").toBe(201);
    expect((await teacher.get(`/admin/groups/${g2.id}/links`)).status).toBe(403);

    const groups = (await teacher.get("/admin/groups")).json as AdminGroup[];
    expect(groups.map((g) => g.name)).toEqual(["ЮР-201", "ЮР-301"]);
    expect(groups[0]).toMatchObject({ students: 1, pending: 0, teacherIds: [t.id] });
    expect(groups[1].teacherIds).toEqual([t.id]);

    const adminId = ((await admin.get("/me")).json as Me).id;
    expect((await admin.patch(`/admin/groups/${g1.id}`, { name: "ЮР-201", teacherIds: [t.id, adminId] })).status).toBe(200);
    const after = (await admin.get("/admin/groups")).json as AdminGroup[];
    expect(after.find((g) => g.id === g1.id)?.teacherIds, "админа в списки доступа не записывают").toEqual([t.id]);
  });

  it("фильтры и поиск; админ не может снять роль с себя; студенту админка закрыта", async () => {
    const { g1 } = await setup();
    const s = client(app);
    const me = (await s.post("/auth/register", reg("zaitseva", { fullName: "Зайцева Мария" }))).json as Me;
    expect((await s.get("/admin/users")).status).toBe(403);
    const pending = (await admin.get("/admin/users?status=pending")).json as AdminUser[];
    expect(pending.map((u) => u.login)).toContain("zaitseva");
    expect(((await admin.get("/admin/users?q=зайц")).json as AdminUser[]).map((u) => u.id)).toEqual([me.id]);
    expect(((await admin.get("/admin/users?group=none&role=student")).json as AdminUser[]).length).toBeGreaterThan(0);
    expect(((await admin.get(`/admin/users?group=${g1.id}`)).json as AdminUser[]).length).toBe(0);

    const adminId = ((await admin.get("/me")).json as Me).id;
    expect((await admin.patch("/admin/users", { ids: [adminId], set: { role: "student" } })).json.error).toBe("self");
  });

  it("изменение ФИО и удаление пользователя: результаты уходят вместе с ним; себя и чужих — нельзя", async () => {
    const { g2, teacher } = await setup();
    const s1 = client(app);
    const me = (await s1.post("/auth/register", reg("dolgov"))).json as Me;
    expect((await admin.patch(`/admin/users/${me.id}`, { fullName: "Долгов Илья" })).status).toBe(200);
    expect((await s1.get("/me")).json.fullName).toBe("Долгов Илья");
    const adminId = ((await admin.get("/me")).json as Me).id;
    expect((await admin.del(`/admin/users/${adminId}`)).json.error).toBe("self");
    // чужой студент (в группе ЮР-202) преподавателю недоступен
    await admin.patch("/admin/users", { ids: [me.id], set: { groupId: g2.id } });
    expect((await teacher.del(`/admin/users/${me.id}`)).status).toBe(404);
    expect((await admin.del(`/admin/users/${me.id}`)).status).toBe(200);
    expect((await s1.get("/me")).status, "сессии удалённого не действуют").toBe(401);
    expect((await admin.get(`/admin/users/${me.id}`)).status).toBe(404);
  });

  it("удаление группы оставляет студентов без группы", async () => {
    const { g1 } = await setup();
    const s = client(app);
    const me = (await s.post("/auth/register", reg("frolov"))).json as Me;
    await admin.patch("/admin/users", { ids: [me.id], set: { groupId: g1.id } });
    expect((await admin.del(`/admin/groups/${g1.id}`)).status).toBe(200);
    expect((await s.get("/me")).json.group).toBeNull();
  });
});

describe("результаты", () => {
  const result = (total: number, extra: Record<string, unknown> = {}) => ({
    caseId: "case-001",
    caseNumber: "001",
    caseTitle: "Чужие письма",
    total,
    max: 100,
    hintsUsed: 1,
    wrongDeductions: 2,
    elapsedMs: 600_000,
    score: { total, max: 100, groups: [] },
    input: { answers: {} },
    caseConfigVersion: "2026-10-12T23:07:52Z",
    gameVersion: "0.1.0",
    resultFormatVersion: 1,
    finishedAt: new Date().toISOString(),
    ...extra,
  });

  /** Результат в базе напрямую: записывает их судья (`/cases/:id/finish`), в тестах статистики нужны готовые строки. */
  const addResult = (userId: number, r: ReturnType<typeof result>) => db.insert(schema.results).values({ ...r, userId, finishedAt: new Date(r.finishedAt), source: "client" });

  it("свои результаты видны; карточка пользователя считает сводку; гостю — нельзя", async () => {
    expect((await client(app).get("/me/results")).status).toBe(401);
    const s = client(app);
    const me = (await s.post("/auth/register", reg("ershova"))).json as Me;
    await addResult(me.id, result(55));
    await addResult(me.id, result(99, { caseId: "case-002", caseNumber: "002", hintsUsed: 3, elapsedMs: null }));
    expect((await s.post("/me/results", result(100))).status, "присланные браузером баллы не принимаются").toBe(404);
    const mine = (await s.get("/me/results")).json;
    expect(mine.map((r: { total: number }) => r.total).sort()).toEqual([55, 99]);

    const detail = (await admin.get(`/admin/users/${me.id}`)).json;
    expect(detail.user.login).toBe("ershova");
    expect(detail.results).toHaveLength(2);
    expect(detail.stats).toMatchObject({ attempts: 2, cases: 2, bestPercent: 99, avgHints: 2, avgMinutes: 10 });
    expect(detail.stats.avgPercent).toBeCloseTo(77, 0);

    // чужой студент преподавателю не виден
    const g = (await admin.post("/admin/groups", { name: "Чужая" })).json;
    await admin.patch("/admin/users", { ids: [me.id], set: { groupId: g.id } });
    const teacher = client(app);
    const t = (await teacher.post("/auth/register", reg("teach2"))).json as Me;
    await admin.patch("/admin/users", { ids: [t.id], set: { role: "teacher", status: "active" } });
    expect((await teacher.get(`/admin/users/${me.id}`)).status).toBe(404);
  });

  it("список прохождений: фильтры, пагинация, студент видит только свои; статистика по выборке", async () => {
    const g = (await admin.post("/admin/groups", { name: "ЮР-301" })).json;
    const a = client(app);
    const ua = (await a.post("/auth/register", reg("aaa"))).json as Me;
    const b = client(app);
    const ub = (await b.post("/auth/register", reg("bbb"))).json as Me;
    await admin.patch("/admin/users", { ids: [ua.id], set: { groupId: g.id } });
    const withBonus = (total: number, extra = {}) =>
      result(total, { score: { total, max: 100, timeBonus: { max: 10, points: total >= 75 ? 10 : 0 }, groups: [{ label: "Определение права", points: 30, max: 30 }] }, ...extra });
    for (let i = 0; i < 7; i++) await addResult(ua.id, withBonus(Math.min(100, 50 + i * 10)));
    await addResult(ub.id, withBonus(20, { caseId: "case-002", caseNumber: "002", caseTitle: "Комната 412" }));

    const page1 = (await admin.get("/results?pageSize=5")).json;
    expect(page1).toMatchObject({ total: 8, page: 1, pageSize: 5 });
    expect(page1.items).toHaveLength(5);
    expect(page1.items[0].user.login).toBeDefined();
    expect((await admin.get("/results?pageSize=5&page=2")).json.items).toHaveLength(3);
    expect((await admin.get(`/results?group=${g.id}`)).json.total).toBe(7);
    expect((await admin.get("/results?case=case-002")).json.total).toBe(1);
    expect((await admin.get(`/results?user=${ub.id}`)).json.total).toBe(1);
    expect((await admin.get("/results?user=me")).json.total).toBe(0);

    // студент — только свои, чужие фильтры игнорируются
    expect((await b.get(`/results?user=${ua.id}`)).json.total).toBe(1);
    const fb = (await b.get("/results/filters")).json;
    expect(fb).toMatchObject({ groups: [], users: [] });
    expect(fb.cases.map((x: { id: string }) => x.id)).toEqual(["case-002"]);

    const stats = (await admin.get(`/results/stats?group=${g.id}`)).json;
    expect(stats).toMatchObject({ attempts: 7, users: 1, cases: 1 });
    // 50..100 из 100 (бонус выше потолка не поднимает)
    expect(stats.avgPercent).toBe(78.6);
    expect(stats.buckets.map((x: { count: number }) => x.count)).toEqual([0, 2, 2, 1, 2]);
    expect(stats.bonusShare).toBe(Math.round((4 / 7) * 100));
    expect(stats.sections).toEqual([{ label: "Определение права", percent: 100 }]);
    expect((await admin.get("/results/filters")).json.users.map((u: { id: number }) => u.id).sort()).toEqual([ua.id, ub.id].sort());
  });
});
