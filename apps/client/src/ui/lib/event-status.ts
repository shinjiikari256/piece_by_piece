import type { ServerEvent } from "../../../../../shared/api";

export type EventPhase = "soon" | "open" | "closed";
type Window = Pick<ServerEvent, "opensAt" | "closesAt">;

const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Момент словами: «через 11:34» (меньше часа), «в 9:00» (сегодня), «21 сентября в 9:00» (позже; с годом, если он не текущий). */
export function whenText(iso: string, now: number): string {
  const at = new Date(iso);
  const diff = at.getTime() - now;
  if (diff >= 0 && diff < HOUR) {
    const s = Math.ceil(diff / 1000);
    return `через ${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }
  const today = new Date(now);
  if (at.toDateString() === today.toDateString()) return `в ${clock(at)}`;
  const date = at.toLocaleDateString("ru-RU", { day: "numeric", month: "long", ...(at.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }) });
  return `${date} в ${clock(at)}`;
}

export const phaseOf = (e: Window, now: number): EventPhase =>
  e.opensAt && new Date(e.opensAt).getTime() > now ? "soon" : e.closesAt && new Date(e.closesAt).getTime() <= now ? "closed" : "open";

export const PHASE: Record<EventPhase, { label: string; tone: "accent" | "good" | "warn" }> = {
  soon: { label: "скоро", tone: "accent" },
  open: { label: "идёт", tone: "good" },
  closed: { label: "закрыто", tone: "warn" },
};

/** Статус со ссылкой на время: «начнётся 21 сентября в 9:00», «закончится через 11:34», «закончилось 3 июня в 18:00». */
export function statusText(e: Window, now: number): string {
  const phase = phaseOf(e, now);
  if (phase === "soon") return `начнётся ${whenText(e.opensAt!, now)}`;
  if (phase === "closed") return `закончилось ${whenText(e.closesAt!, now)}`;
  return e.closesAt ? `закончится ${whenText(e.closesAt, now)}` : "без ограничения по времени";
}

/** Длительность до начала: «длительность 2 ч 30 мин» или явное «без ограничения по времени». */
export function durationText(e: Window): string {
  if (!e.closesAt) return "без ограничения по времени";
  const from = e.opensAt ? new Date(e.opensAt).getTime() : null;
  if (from === null) return "";
  const min = Math.max(1, Math.round((new Date(e.closesAt).getTime() - from) / 60_000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const parts = [d && `${d} дн`, h && `${h} ч`, m && `${m} мин`].filter(Boolean);
  return `длительность ${parts.join(" ")}`;
}

/** Порядок в списке: идущие (скорее заканчиваются — выше), затем будущие (скорее начнутся), затем закрытые (недавние выше). */
export function compareEvents(a: ServerEvent, b: ServerEvent, now: number): number {
  const rank = { open: 0, soon: 1, closed: 2 };
  const pa = phaseOf(a, now);
  const pb = phaseOf(b, now);
  if (pa !== pb) return rank[pa] - rank[pb];
  const t = (iso: string | null, fallback: number) => (iso ? new Date(iso).getTime() : fallback);
  if (pa === "open") return t(a.closesAt, Infinity) - t(b.closesAt, Infinity) || b.id - a.id;
  if (pa === "soon") return t(a.opensAt, 0) - t(b.opensAt, 0) || b.id - a.id;
  return t(b.closesAt, 0) - t(a.closesAt, 0) || b.id - a.id;
}
