import { describe, expect, it } from "vitest";
import { emptyProgress } from "../../../../shared/conditions";
import { eventParts, eventSortKey, formatEventTime, isEventKnown, isRangeOrdered, knownEvents, parseEventTime } from "../../../../shared/events";
import { migrateCase } from "../../../../shared/migrate";
import type { CaseEvent, CaseFile } from "../../../../shared/case";
import { toEventTime } from "../editor/fields/EventTime";
import { caseWarnings } from "./warnings";
import { validateCase } from "./validate";
import case001 from "./cases/case-001.json";
import case002 from "./cases/case-002.json";
import testCase from "./test-cases/case-test-moveto.json";

const base = () => structuredClone(case001) as unknown as CaseFile;
const errorsOf = (c: CaseFile) => {
  const r = validateCase(c);
  return r.ok ? "" : r.errors.join("\n");
};

describe("хронология: время события", () => {
  it("разбирает дату, год и время; лишнего не принимает", () => {
    expect(parseEventTime("03-14")).toEqual({ year: undefined, month: 3, day: 14, hour: undefined, minute: undefined });
    expect(parseEventTime("2026-03-14T21:43")).toEqual({ year: 2026, month: 3, day: 14, hour: 21, minute: 43 });
    for (const bad of ["", "14 марта", "13-01", "02-30", "2026-02-29", "03-14T24:00", "03-14T10:60", "03-14T9:00"]) expect(parseEventTime(bad), bad).toBeNull();
    expect(parseEventTime("02-29")).not.toBeNull(); // без года — високосный условный
  });

  it("подпись для игрока: год и время показываются, только если заданы", () => {
    expect(formatEventTime("03-10")).toBe("10 марта");
    expect(formatEventTime("03-14T21:30")).toBe("14 марта, 21:30");
    expect(formatEventTime("2026-03-14")).toBe("14 марта 2026");
    expect(formatEventTime("2026-03-14T09:05")).toBe("14 марта 2026, 09:05");
    expect(formatEventTime("мусор")).toBe("мусор");
  });

  it("диапазон: один день с временем, несколько дней, без времени", () => {
    expect(formatEventTime("03-14T21:30", "03-14T22:10")).toBe("14 марта, с 21:30 по 22:10");
    expect(formatEventTime("10-01", "10-05")).toBe("с 1 октября по 5 октября");
    expect(formatEventTime("10-03", "10-03")).toBe("3 октября");
    expect(formatEventTime("10-03T22:00", "10-04T02:00")).toBe("с 3 октября, 22:00 по 4 октября, 02:00");
  });

  it("сортировка по началу; дата без времени — 00:00; без года — один условный год", () => {
    const keys = ["03-14T21:43", "03-10", "03-14", "03-14T21:30"].map((x) => eventSortKey(x));
    expect([...keys].sort((a, b) => a - b)).toEqual([keys[1], keys[2], keys[3], keys[0]]);
    expect(eventSortKey("2026-01-01")).toBeGreaterThan(eventSortKey("2025-12-31T23:59"));
    expect(eventSortKey("мусор")).toBe(Number.POSITIVE_INFINITY);
  });

  it("конец не раньше начала", () => {
    expect(isRangeOrdered("03-14T21:30", "03-14T21:30")).toBe(true);
    expect(isRangeOrdered("03-14T21:30", "03-14T21:29")).toBe(false);
    expect(isRangeOrdered("10-05", "10-01")).toBe(false);
  });

  it("пикер собирает строку дела: год и время необязательны, день подрезается по месяцу", () => {
    expect(toEventTime({ month: 3, day: 4 })).toBe("03-04");
    expect(toEventTime({ year: 2026, month: 3, day: 4, hour: 9, minute: 5 })).toBe("2026-03-04T09:05");
    expect(toEventTime({ month: 2, day: 31 })).toBe("02-29");
    expect(toEventTime({ year: 2025, month: 2, day: 31 })).toBe("2025-02-28");
    expect(parseEventTime(toEventTime({ year: 2026, month: 3, day: 14, hour: 21, minute: 43 }))).toMatchObject({ month: 3, day: 14, hour: 21 });
  });
});

describe("хронология: что видит игрок", () => {
  const ev = (over: Partial<CaseEvent> & { id: string }): CaseEvent => ({ title: over.id, at: "03-14", ...over });
  const withEvidence = (id: string, relatedEvents: string[]) => ({ id, relatedEvents }) as CaseFile["evidence"][number];
  const known = (events: CaseEvent[], evidence: CaseFile["evidence"], p = emptyProgress()) => knownEvents({ events, evidence }, p).map((e) => e.id);

  it("событие без улик и условия видно с начала", () => {
    expect(known([ev({ id: "a" })], [])).toEqual(["a"]);
  });

  it("событие с уликами появляется, когда собрана любая из них", () => {
    const evidence = [withEvidence("e1", ["a"]), withEvidence("e2", ["a"])];
    expect(known([ev({ id: "a" })], evidence)).toEqual([]);
    expect(known([ev({ id: "a" })], evidence, { ...emptyProgress(), collected: ["e2"] })).toEqual(["a"]);
  });

  it("requires проверяется вместе с уликами: нужно и то и другое", () => {
    const evidence = [withEvidence("e1", ["a"])];
    const events = [ev({ id: "a", requires: { flags: ["f"] } })];
    expect(known(events, evidence, { ...emptyProgress(), collected: ["e1"] })).toEqual([]);
    expect(known(events, evidence, { ...emptyProgress(), flags: ["f"] })).toEqual([]);
    expect(known(events, evidence, { ...emptyProgress(), collected: ["e1"], flags: ["f"] })).toEqual(["a"]);
  });

  it("requires без улик: условие решает всё, локация передаётся", () => {
    const events = [ev({ id: "a", requires: { inLocation: ["hall"] } })];
    expect(isEventKnown({ evidence: [] }, events[0], emptyProgress(), "hall")).toBe(true);
    expect(isEventKnown({ evidence: [] }, events[0], emptyProgress(), "yard")).toBe(false);
  });

  it("лента по порядку времени, при равенстве — как в деле; даты без года встают в год, который задал автор", () => {
    const events = [ev({ id: "late", at: "03-14T22:00" }), ev({ id: "b", at: "03-10" }), ev({ id: "a", at: "03-10" }), ev({ id: "dated", at: "2026-03-01" })];
    expect(known(events, [])).toEqual(["dated", "b", "a", "late"]);
  });

  it("события без года и с годом сортируются вместе", () => {
    const events = [ev({ id: "dated", at: "2026-10-01" }), ev({ id: "plain", at: "10-03T12:40" }), ev({ id: "later", at: "2026-10-03T17:15" }), ev({ id: "early", at: "09-30" })];
    expect(known(events, [])).toEqual(["early", "dated", "plain", "later"]);
  });

  it("части для ленты: день, время, диапазон", () => {
    expect(eventParts("10-03T12:40")).toMatchObject({ day: "3 октября", when: "12:40", range: false });
    expect(eventParts("10-03")).toMatchObject({ when: "", range: false });
    expect(eventParts("10-03T12:40", "10-03T17:15")).toMatchObject({ when: "12:40 – 17:15", range: true });
    expect(eventParts("10-01", "10-05")).toMatchObject({ day: "1 октября", when: "до 5 октября", range: true });
    expect(eventParts("10-03T22:00", "10-04T02:00").when).toBe("22:00 до 4 октября, 02:00");
    expect(eventParts("2026-10-03T12:40").dayKey).not.toBe(eventParts("10-03T12:40").dayKey);
  });

  it("в готовых делах без собранных улик лента не раскрывает событий с уликами", () => {
    for (const c of [case001, case002] as unknown as CaseFile[]) {
      const withSource = new Set(c.evidence.flatMap((e) => e.relatedEvents));
      const visible = knownEvents(c, emptyProgress()).map((e) => e.id);
      expect(visible.every((id) => !withSource.has(id))).toBe(true);
      const all = knownEvents(c, { ...emptyProgress(), collected: c.evidence.map((e) => e.id) });
      expect(all).toHaveLength(c.events.filter((e) => !e.requires).length);
    }
  });
});

describe("хронология: формат и миграция", () => {
  it("миграция 8 → 9: текст времени разбирается в `at`, диапазон — в `at`/`until`", () => {
    const old: Record<string, unknown> = { ...(structuredClone(case001) as unknown as Record<string, unknown>), formatVersion: 8 };
    old.events = [
      { id: "a", time: "10 марта", title: "A" },
      { id: "b", time: "14 марта, 21:30", title: "B" },
      { id: "c", time: "с 1 октября по 5 октября", title: "C" },
      { id: "d", time: "14 марта 2026, 9:05", title: "D" },
      { id: "e", time: "вечером", title: "E" },
    ];
    const m = migrateCase(old);
    expect(m.ok).toBe(true);
    const events = ((m.ok ? m.data : {}) as { events: CaseEvent[] }).events;
    expect(events.map((e) => [e.at, e.until])).toEqual([["03-10", undefined], ["03-14T21:30", undefined], ["10-01", "10-05"], ["2026-03-14T09:05", undefined], ["вечером", undefined]]);
    expect(events.every((e) => !("time" in e))).toBe(true);
  });

  it("нераспознанное старое время не проходит проверку — автор увидит ошибку", () => {
    const old = { ...(structuredClone(case001) as unknown as Record<string, unknown>), formatVersion: 8, events: [{ id: "e", time: "вечером", title: "E" }] };
    expect(validateCase(old).ok).toBe(false);
  });

  it("готовые дела — в текущем формате, у каждого события есть корректное время", () => {
    for (const c of [case001, case002, testCase] as unknown as CaseFile[]) {
      expect(c.events.length).toBeGreaterThan(0);
      for (const e of c.events) {
        expect(parseEventTime(e.at), `${c.id}/${e.id}`).not.toBeNull();
        if (e.until) expect(isRangeOrdered(e.at, e.until)).toBe(true);
      }
    }
  });
});

describe("хронология: валидатор и предупреждения", () => {
  it("ловит несуществующую дату, конец раньше начала и неизвестную ссылку в requires", () => {
    const c = base();
    c.events.push({ id: "bad_date", title: "x", at: "02-30" }, { id: "bad_range", title: "x", at: "03-14T22:00", until: "03-14T21:00" }, { id: "bad_ref", title: "x", at: "03-14", requires: { evidence: ["нет_такой"], flags: ["f_нет"] } });
    const text = errorsOf(c);
    expect(text).toContain("event bad_date: такой даты или времени нет");
    expect(text).toContain("event bad_range: конец");
    expect(text).toContain("event bad_ref.requires");
  });

  it("флаг в requires события должен иметь название, и предупреждение — если его никто не ставит", () => {
    const c = base();
    c.events.push({ id: "gated", title: "x", at: "03-14", requires: { flags: ["flag_for_event"] } });
    expect(errorsOf(c)).toContain("flag_for_event");
    expect(caseWarnings(c).join("\n")).toContain("flag flag_for_event: условия ждут этот флаг");
  });

  it("корректный диапазон и событие с requires проходят", () => {
    const c = base();
    c.events.push({ id: "ok_range", title: "x", at: "03-14T21:30", until: "03-14T22:10", requires: { evidence: [c.evidence[0].id] } });
    expect(errorsOf(c)).toBe("");
  });
});

describe("тестовое дело: хронология", () => {
  const c = testCase as unknown as CaseFile;
  const at = (id: string) => c.events.find((e) => e.id === id)!;

  it("содержит год, диапазон дат, диапазон времени и условия; проходит валидацию без предупреждений о хронологии", () => {
    const r = validateCase(testCase);
    expect(r.ok ? [] : r.errors).toEqual([]);
    expect(at("ev_test_open").at).toMatch(/^\d{4}-/);
    expect(at("ev_test_range").until).toBeDefined();
    expect(at("ev_test_clock").at).toContain("T");
    expect(caseWarnings(c).filter((w) => w.includes("ev_test_"))).toEqual([]);
  });

  it("события появляются по условиям", () => {
    const ids = (p = emptyProgress()) => knownEvents(c, p).map((e) => e.id).filter((id) => id.startsWith("ev_test_"));
    expect(ids()).toEqual(["ev_test_open"]);
    expect(ids({ ...emptyProgress(), flags: ["zuev_admitted"] })).toContain("ev_test_range");
    expect(ids({ ...emptyProgress(), flags: ["timur_truth"] })).not.toContain("ev_test_clock");
    expect(ids({ ...emptyProgress(), flags: ["timur_truth"], collected: ["timur_testimony"] })).toContain("ev_test_clock");
  });
});
