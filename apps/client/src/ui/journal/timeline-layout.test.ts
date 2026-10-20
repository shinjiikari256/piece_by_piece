import { describe, expect, it } from "vitest";
import { eventSpan } from "../../../../../shared/events";
import { formatGap, layoutTimeline } from "./timeline-layout";

const span = (start: number, end = start) => ({ start, end, dateOnly: false, range: end > start });

describe("раскладка хронологии", () => {
  it("подписи промежутков", () => {
    expect(formatGap(45)).toMatch(/45/);
    expect(formatGap(60 * 24 * 3)).toMatch(/3/);
  });

  it("близкие события — на одной оси без разрыва", () => {
    const l = layoutTimeline([span(0), span(30)]);
    expect(l.breaks).toHaveLength(0);
    expect(l.placed[1].x0).toBeGreaterThan(l.placed[0].x0);
  });

  it("длинный промежуток сворачивается в разрыв", () => {
    const near = layoutTimeline([span(0), span(60)]);
    const far = layoutTimeline([span(0), span(60 * 24 * 10)]);
    expect(far.breaks).toHaveLength(1);
    expect(far.width).toBeLessThan(near.width + 2000);
  });

  it("пересекающиеся карточки уходят на разные дорожки", () => {
    const l = layoutTimeline([span(0), span(1)]);
    expect(l.placed[0].lane).not.toBe(l.placed[1].lane);
    expect(l.lanes).toBeGreaterThanOrEqual(2);
  });

  it("диапазон по датам без времени — сутки", () => {
    const s = eventSpan({ at: "2026-10-01", until: "2026-10-01" }, 2026);
    expect(s.end - s.start).toBe(24 * 60);
  });
});

describe("включение хронологии", () => {
  it("нужны события и не выключено автором", async () => {
    const { timelineEnabled } = await import("../../../../../shared/events");
    expect(timelineEnabled({ events: [] })).toBe(false);
    expect(timelineEnabled({ events: [1] })).toBe(true);
    expect(timelineEnabled({ events: [1], settings: {} })).toBe(true);
    expect(timelineEnabled({ events: [1], settings: { timeline: false } })).toBe(false);
  });
});
