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
    expect(d.entries[0].band).toEqual({ from: 0, to: DAY, openStart: true, openEnd: true });
  });

  it("диапазон в один день — одна карточка и полоса с отметками на обоих концах", () => {
    const [d] = buildDays([ev("a", "10-01T12:40", "10-01T17:15")], 2026);
    expect(d.entries).toHaveLength(1);
    expect(d.entries[0].band).toEqual({ from: 12 * 60 + 40, to: 17 * 60 + 15, openStart: false, openEnd: false });
    expect(d.entries[0].card.kind).toBe("range");
  });

  it("диапазон на несколько дней: по карточке в начале, конце и в промежуточном дне с другим событием", () => {
    const days = buildDays([ev("r", "10-01", "10-05"), ev("x", "10-03T10:00")], 2026);
    expect(days).toHaveLength(3);
    const kinds = days.map((d) => d.entries.find((e) => e.ev.id === "r")!.card.kind);
    expect(kinds).toEqual(["start", "through", "end"]);
    expect(days[0].entries[0].band).toMatchObject({ openStart: false, openEnd: true });
    expect(days[2].entries[0].band).toMatchObject({ from: 0, to: DAY, openStart: true, openEnd: false });
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
    const [c] = layoutDay(d.entries, 600, 176).placed;
    expect(c.left + 176).toBeLessThanOrEqual(600);
  });
});

describe("настройки хронологии", () => {
  it("хронология есть, когда хотя бы одно событие отмечено «Показывать в хронологии»", () => {
    expect(timelineEnabled({ events: [] })).toBe(false);
    expect(timelineEnabled({ events: [{}] })).toBe(false);
    expect(timelineEnabled({ events: [{}, { showInTimeline: true }] })).toBe(true);
  });

  it("базовый год из настроек важнее самого раннего года в деле", () => {
    const events = [{ at: "2024-01-01" }];
    expect(eventYear({ events })).toBe(2024);
    expect(eventYear({ events, settings: { timelineYear: 2030 } })).toBe(2030);
  });
});
