import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { readdirSync } from "node:fs";
import { BUNDLED_CASES_DIR, saveCaseVersion, seedCases } from "./cases";
import { memoryDb, schema, type Db } from "./db";

const bundledCount = readdirSync(BUNDLED_CASES_DIR).filter((f) => f.endsWith(".json")).length;

let db: Db;
beforeEach(async () => {
  db = await memoryDb();
});

describe("дела в базе", () => {
  it("засевает дела из репозитория и не дублирует при повторе", async () => {
    const first = await seedCases(db);
    expect(first.failed).toEqual([]);
    expect(first.created).toHaveLength(bundledCount);
    expect(await seedCases(db)).toEqual({ created: [], failed: [] });
    expect(await db.select().from(schema.caseVersions)).toHaveLength(bundledCount);
  });

  it("новое содержимое — новая версия, текущая переключается, старая остаётся", async () => {
    await seedCases(db);
    const [row] = await db.select().from(schema.caseVersions).limit(1);
    const body = row.body as Parameters<typeof saveCaseVersion>[1];
    expect(await saveCaseVersion(db, { ...body, updatedAt: "2099-01-01T00:00:00.000Z" })).toBe("created");
    const versions = await db.select().from(schema.caseVersions).where(eq(schema.caseVersions.caseId, body.id));
    expect(versions).toHaveLength(2);
    const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, body.id));
    expect(versions.find((v) => v.id === c.currentVersionId)?.caseUpdatedAt).toBe("2099-01-01T00:00:00.000Z");
  });
});
