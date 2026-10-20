import type { EventSpan } from "../../../../../shared/events";

/** Параметры шкалы: пикселей на минуту, предел «пустого» промежутка, ширина разрыва, карточка. */
export interface TimelineOptions {
  pxPerMin: number;
  /** Промежуток длиннее этого (мин) без событий сворачивается в разрыв. */
  maxGap: number;
  breakWidth: number;
  cardWidth: number;
  pad: number;
  /** Наименьшая ширина между соседними моментами (чтобы точки не слипались). */
  minStep: number;
}

export const TIMELINE_DEFAULTS: TimelineOptions = { pxPerMin: 3, maxGap: 90, breakWidth: 64, cardWidth: 176, pad: 24, minStep: 14 };

export interface PlacedEvent {
  index: number;
  x0: number;
  x1: number;
  lane: number;
}
export interface Tick {
  x: number;
  minute: number;
  /** Первая отметка нового дня — над ней подписывается дата. */
  newDay: boolean;
}
export interface Break {
  x: number;
  width: number;
  /** Сколько минут свёрнуто. */
  minutes: number;
}
export interface TimelineLayout {
  width: number;
  lanes: number;
  placed: PlacedEvent[];
  ticks: Tick[];
  breaks: Break[];
}

const day = (minute: number) => Math.floor(minute / 1440);

/**
 * Раскладка событий по горизонтальной шкале. Ось ломаная: промежутки без событий длиннее `maxGap` сворачиваются в разрыв
 * фиксированной ширины, остальное — в масштабе. Карточки раскладываются по дорожкам так, чтобы не перекрываться.
 */
export function layoutTimeline(spans: EventSpan[], opts: Partial<TimelineOptions> = {}): TimelineLayout {
  const o = { ...TIMELINE_DEFAULTS, ...opts };
  if (!spans.length) return { width: 0, lanes: 0, placed: [], ticks: [], breaks: [] };
  const points = [...new Set(spans.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b);
  const xs = new Map<number, number>();
  const breaks: Break[] = [];
  let x = o.pad;
  points.forEach((p, i) => {
    xs.set(p, x);
    const gap = points[i + 1] - p;
    if (i === points.length - 1) return;
    if (gap > o.maxGap) {
      breaks.push({ x, width: o.breakWidth, minutes: gap });
      x += o.breakWidth;
    } else x += Math.max(gap * o.pxPerMin, o.minStep);
  });
  const ticks = points.map((minute, i) => ({ x: xs.get(minute)!, minute, newDay: i === 0 || day(minute) !== day(points[i - 1]) }));

  // дорожки: событие занимает отрезок от начала до большего из конца и ширины карточки
  const order = spans.map((_, index) => index).sort((a, b) => spans[a].start - spans[b].start || a - b);
  const laneEnds: number[] = [];
  const placed: PlacedEvent[] = [];
  for (const index of order) {
    const x0 = xs.get(spans[index].start)!;
    const x1 = xs.get(spans[index].end)!;
    const lane = laneEnds.findIndex((end) => end + 8 <= x0);
    const at = lane < 0 ? laneEnds.length : lane;
    laneEnds[at] = Math.max(x1, x0 + o.cardWidth);
    placed.push({ index, x0, x1, lane: at });
  }
  return { width: Math.max(...laneEnds) + o.pad, lanes: laneEnds.length, placed, ticks, breaks };
}

/** «2 ч 20 мин», «1 д 3 ч» — сколько свёрнуто в разрыве. */
export function formatGap(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d) return h ? `${d} д ${h} ч` : `${d} д`;
  return h ? (m ? `${h} ч ${m} мин` : `${h} ч`) : `${m} мин`;
}
