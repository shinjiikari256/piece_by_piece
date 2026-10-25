import { Select } from "./Select";
import "./DateTimePicker.css";

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(Number(v)) || min));

/**
 * Дата и время (ISO, местное время) без нативных `<input type="date|time">`: день, месяц списком, год, чч:мм.
 * `null` — не задано (подпись `emptyLabel`); галочка включает момент, по умолчанию — сегодня 09:00.
 */
export function DateTimePicker({ value, onChange, emptyLabel, label }: { value: string | null; onChange: (v: string | null) => void; emptyLabel: string; label: string }) {
  const d = value ? new Date(value) : null;
  const set = (patch: { day?: number; month?: number; year?: number; hour?: number; minute?: number }) => {
    if (!d) return;
    const year = patch.year ?? d.getFullYear();
    const month = patch.month ?? d.getMonth() + 1;
    const day = Math.min(patch.day ?? d.getDate(), new Date(year, month, 0).getDate());
    onChange(new Date(year, month - 1, day, patch.hour ?? d.getHours(), patch.minute ?? d.getMinutes()).toISOString());
  };
  const enable = (on: boolean) => {
    if (!on) return onChange(null);
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    onChange(now.toISOString());
  };
  return (
    <div className="dtp" role="group" aria-label={label}>
      <label className="dtp__check">
        <input type="checkbox" checked={!!d} onChange={(e) => enable(e.target.checked)} />
        {d ? "задать" : emptyLabel}
      </label>
      {d && (
        <>
          <span className="dtp__part">
            <input type="number" className="dtp__num" min={1} max={31} aria-label="День" value={d.getDate()} onChange={(e) => set({ day: clamp(e.target.value, 1, 31) })} />
            <Select
              className="dtp__month"
              title="Месяц"
              value={String(d.getMonth() + 1)}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
              onChange={(v) => set({ month: Number(v) })}
            />
            <input type="number" className="dtp__year" min={1970} max={9999} aria-label="Год" value={d.getFullYear()} onChange={(e) => set({ year: clamp(e.target.value, 1970, 9999) })} />
          </span>
          <span className="dtp__part">
            <input type="number" className="dtp__num" min={0} max={23} aria-label="Часы" value={pad(d.getHours())} onChange={(e) => set({ hour: clamp(e.target.value, 0, 23) })} />
            <span aria-hidden>:</span>
            <input type="number" className="dtp__num" min={0} max={59} aria-label="Минуты" value={pad(d.getMinutes())} onChange={(e) => set({ minute: clamp(e.target.value, 0, 59) })} />
          </span>
        </>
      )}
    </div>
  );
}
