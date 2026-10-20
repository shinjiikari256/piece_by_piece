import { parseEventTime, type EventMoment } from "../../../../../shared/events";
import { Select } from "../../ui/Select";
import "./EventTime.css";

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const pad = (n: number) => String(n).padStart(2, "0");
const DEFAULT: EventMoment = { month: 1, day: 1 };

/** Момент → строка дела («ГГГГ-ММ-ДД[Tчч:мм]», год и время необязательны). */
export function toEventTime(t: EventMoment): string {
  const daysIn = new Date(t.year ?? 2024, t.month, 0).getDate();
  const date = `${t.year ? `${String(t.year).padStart(4, "0")}-` : ""}${pad(t.month)}-${pad(Math.min(t.day, daysIn))}`;
  return t.hour === undefined ? date : `${date}T${pad(t.hour)}:${pad(t.minute ?? 0)}`;
}

const clamp = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(Number(v)) || min));

/**
 * Дата и время события без нативных `<input type="date|time">` (во встроенном браузере VS Code они могут не открываться):
 * день, месяц списком, год и время — числами. Год и время необязательны.
 */
export function EventTimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const t = parseEventTime(value) ?? DEFAULT;
  const set = (patch: Partial<EventMoment>) => onChange(toEventTime({ ...t, ...patch }));
  const hasTime = t.hour !== undefined;
  return (
    <div className="event-time">
      {label && <span className="ef__label event-time__label">{label}</span>}
      <input type="number" className="event-time__num" min={1} max={31} aria-label="День" value={t.day} onChange={(e) => set({ day: clamp(e.target.value, 1, 31) })} />
      <Select
        className="event-time__month"
        title="Месяц"
        value={String(t.month)}
        options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
        onChange={(v) => set({ month: Number(v) })}
      />
      <input
        type="number"
        className="event-time__year"
        min={1}
        max={9999}
        placeholder="год"
        aria-label="Год (необязательно)"
        value={t.year ?? ""}
        onChange={(e) => set({ year: e.target.value === "" ? undefined : clamp(e.target.value, 1, 9999) })}
      />
      <label className="event-time__check">
        <input type="checkbox" checked={hasTime} onChange={(e) => set(e.target.checked ? { hour: 12, minute: 0 } : { hour: undefined, minute: undefined })} />
        время
      </label>
      <span className="event-time__clock">
        <input type="number" className="event-time__num" min={0} max={23} aria-label="Часы" disabled={!hasTime} value={hasTime ? pad(t.hour!) : ""} placeholder="чч" onChange={(e) => set({ hour: clamp(e.target.value, 0, 23) })} />
        <span aria-hidden>:</span>
        <input type="number" className="event-time__num" min={0} max={59} aria-label="Минуты" disabled={!hasTime} value={hasTime ? pad(t.minute ?? 0) : ""} placeholder="мм" onChange={(e) => set({ minute: clamp(e.target.value, 0, 59) })} />
      </span>
    </div>
  );
}

/** «Когда»: начало и, если событие длилось, конец. */
export function EventWhen({ at, until, onChange }: { at: string; until?: string; onChange: (next: { at: string; until?: string }) => void }) {
  return (
    <div className="ef__fields">
      <EventTimePicker label={until === undefined ? "Когда" : "С"} value={at} onChange={(v) => onChange({ at: v, until })} />
      <label className="event-time__check">
        <input type="checkbox" checked={until !== undefined} onChange={(e) => onChange({ at, until: e.target.checked ? at : undefined })} />
        Событие длилось (задать конец)
      </label>
      {until !== undefined && <EventTimePicker label="По" value={until} onChange={(v) => onChange({ at, until: v })} />}
    </div>
  );
}
