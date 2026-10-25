import { describe, expect, it } from "vitest";
import { compareEvents, durationText, phaseOf, statusText, whenText } from "./event-status";

const at = (s: string) => new Date(s).getTime();
const now = at("2026-09-10T08:00:00");

describe("статус мероприятия", () => {
  it("момент: обратный отсчёт, сегодня, другой день", () => {
    expect(whenText("2026-09-10T08:11:34", now)).toBe("через 11:34");
    expect(whenText("2026-09-10T15:00:00", now)).toBe("в 15:00");
    expect(whenText("2026-09-21T09:00:00", now)).toBe("21 сентября в 09:00");
  });

  it("фаза и текст", () => {
    expect(phaseOf({ opensAt: "2026-09-21T09:00:00", closesAt: null }, now)).toBe("soon");
    expect(statusText({ opensAt: "2026-09-21T09:00:00", closesAt: null }, now)).toBe("начнётся 21 сентября в 09:00");
    expect(statusText({ opensAt: null, closesAt: "2026-09-10T08:30:00" }, now)).toBe("закончится через 30:00");
    expect(statusText({ opensAt: null, closesAt: null }, now)).toBe("без ограничения по времени");
    expect(phaseOf({ opensAt: null, closesAt: "2026-09-09T08:00:00" }, now)).toBe("closed");
  });

  it("длительность", () => {
    expect(durationText({ opensAt: "2026-09-21T09:00:00", closesAt: "2026-09-21T11:30:00" })).toBe("длительность 2 ч 30 мин");
    expect(durationText({ opensAt: "2026-09-21T09:00:00", closesAt: null })).toBe("без ограничения по времени");
  });

  it("сортировка: идёт, скоро, закрыто", () => {
    const ev = (id: number, opensAt: string | null, closesAt: string | null) => ({ id, opensAt, closesAt }) as never;
    const list = [ev(1, null, "2026-09-01T00:00:00"), ev(2, "2026-09-20T00:00:00", null), ev(3, null, null)];
    expect(list.sort((a, b) => compareEvents(a, b, now)).map((e: { id: number }) => e.id)).toEqual([3, 2, 1]);
  });
});
