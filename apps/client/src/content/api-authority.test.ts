import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../server/src/app";
import { ensureAdmin } from "../../../server/src/bootstrap";
import { seedCases } from "../../../server/src/cases";
import { memoryDb } from "../../../server/src/db";
import { api } from "../state/account";
import { ApiAuthority } from "./api-authority";
import { LocalAuthority } from "./local-authority";
import { caseRepository } from "./repository";

/** Клиентский судья против настоящего сервера (приложение Hono + PGlite, сеть подменена). */
beforeEach(async () => {
  const db = await memoryDb();
  const app = createApp(db, { secureCookies: false, trustProxy: false });
  await ensureAdmin(db, "admin", "adminpass1");
  await seedCases(db);
  let cookie = "";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const res = await app.request(url, { ...init, headers: { ...(init.headers as object), ...(cookie ? { cookie } : {}) } });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  });
  await api("POST", "/auth/register", { login: "student1", fullName: "Студент", password: "password123", consent: true });
});

afterEach(() => vi.unstubAllGlobals());

describe("ApiAuthority", () => {
  it("даёт то же, что LocalAuthority, но без ответов в деле", async () => {
    const full = await caseRepository.get("case-001");
    const local = new LocalAuthority(full);
    const remote = await ApiAuthority.open("case-001");

    expect(JSON.stringify(remote.caseFile)).not.toContain('"correct"');
    expect(remote.caseFile.id).toBe(local.caseFile.id);

    const d = full.deductions[0];
    const option = d.options[0];
    expect(await remote.checkDeduction(d.id, option.id)).toEqual(await local.checkDeduction(d.id, option.id));
    expect(await remote.revealHint(full.hints[0].level)).toEqual(await local.revealHint(full.hints[0].level));

    const input = {
      answers: Object.fromEntries(full.questions.map((q) => [q.id, [q.options[0].id]])),
      hintsUsed: 1,
      elapsedMs: 300_000,
      wrongDeductions: 0,
      importantEvidence: [],
    };
    const [r, l] = [await remote.finish(input), await local.finish(input)];
    expect(r.score).toEqual(JSON.parse(JSON.stringify(l.score)));
    expect(r.recordedOnServer).toBe(true);
    expect(await remote.debrief()).toEqual(JSON.parse(JSON.stringify(full.solution)));
  });
});
