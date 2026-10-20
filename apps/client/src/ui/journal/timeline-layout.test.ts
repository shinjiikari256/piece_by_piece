import { describe, expect, it } from "vitest";
import { timelineEnabled, eventYear } from "../../../../../shared/events";
import { buildDays, DAY, layoutDay } from "./timeline-layout";

const ev = (id: string, at: string, until?: string) => ({ id, title: id, at, ...(until ? { until } : {}) });

describe("дни хронологии", () => {
  it("дни есть только там, где есть события", () => {
    const days = buildDays([ev("a", "10-01T09:00"), ev("b", "10-05T10:00")], 2026);
    expect(days).toHaveLength(2);
    expect(days[1].start - days[0].start).toBe(4 * DAY);
  });

  it("момент без времени занимает весь день", () => {
    const [d] = buildDays([ev("a", "10-01")], 2026);
    expect(d.entries[0].band).toEqual({ from: 0, to: DAY });
  });

  it("диапазон в один день — полоса с карточками начала и конца", () => {
    const [d] = buildDays([ev("a", "10-01T12:40", "10-01T17:15")], 2026);
    const e = d.entries[0];
    expect(e.band).toEqual({ from: 12 * 60 + 40, to: 17 * 60 + 15 });
    expect(e.cards.map((c) => c.kind)).toEqual(["start", "end"]);
  });

  it("диапазон на несколько дней: начало, конец и полоса в промежуточном дне, где есть другое событие", () => {
    const days = buildDays([ev("r", "10-01", "10-05"), ev("x", "10-03T10:00")], 2026);
    expect(days).toHaveLength(3);
    const mid = days[1].entries.find((e) => e.ev.id === "r")!;
    expect(mid.band).toEqual({ from: 0, to: DAY });
    expect(mid.cards).toHaveLength(0);
    expect(days[0].entries[0].cards.map((c) => c.kind)).toEqual(["start"]);
    expect(days[2].entries[0].band).toEqual({ from: 0, to: DAY });
    expect(days[2].entries[0].cards.map((c) => c.kind)).toEqual(["end"]);
  });

  it("промежуточные дни без других событий не создаются", () => {
    expect(buildDays([ev("r", "10-01", "10-05")], 2026)).toHaveLength(2);
  });

  it("близкие карточки уходят на разные дорожки, дальние — на одну", () => {
    const close = buildDays([ev("a", "10-01T09:00"), ev("b", "10-01T09:30")], 2026)[0];
    expect(layoutDay(close.entries, 960, 176).lanes).toBe(2);
    const far = buildDays([ev("a", "10-01T01:00"), ev("b", "10-01T20:00")], 2026)[0];
    expect(layoutDay(far.entries, 960, 176).lanes).toBe(1);
  });

  it("карточка у края не выходит за шкалу", () => {
    const d = buildDays([ev("a", "10-01T23:50")], 2026)[0];
    const [c] = layoutDay(d.entries, 600, 176).cards;
    expect(c.left + 176).toBeLessThanOrEqual(600);
  });
});

describe("настройки хронологии", () => {
  it("включена, когда есть события и автор не выключил", () => {
    expect(timelineEnabled({ events: [] })).toBe(false);
    expect(timelineEnabled({ events: [1] })).toBe(true);
    expect(timelineEnabled({ events: [1], settings: { timeline: false } })).toBe(false);
  });

  it("базовый год из настроек важнее самого раннего года в деле", () => {
    const events = [{ at: "2024-01-01" }];
    expect(eventYear({ events })).toBe(2024);
    expect(eventYear({ events, settings: { timelineYear: 2030 } })).toBe(2030);
  });
});
