import { Select } from "../../ui/Select";
import type { ClipStep } from "../../../../../shared/case";

/** Клип: список шагов «кадр спрайта + сколько миллисекунд показывать». */
export function ClipEditor({ value, frames, onChange }: { value: ClipStep[]; frames: string[]; onChange: (v: ClipStep[]) => void }) {
  const set = (i: number, s: ClipStep) => onChange(value.map((x, k) => (k === i ? s : x)));
  return (
    <div className="stack">
      {value.map((s, i) => (
        <div key={i} className="pair">
          <Select value={s.frame} options={frames.map((f) => ({ value: f, label: f }))} onChange={(v) => set(i, { ...s, frame: v })} />
          <input type="number" min={10} max={10000} step={10} value={s.ms} onChange={(ev) => set(i, { ...s, ms: Math.min(10000, Math.max(10, Math.trunc(Number(ev.target.value)) || 100)) })} />
          <button className="btn btn--sm btn--icon" aria-label="Убрать шаг" disabled={value.length <= 1} onClick={() => onChange(value.filter((_, k) => k !== i))}>
            ×
          </button>
        </div>
      ))}
      <button className="btn btn--sm" onClick={() => onChange([...value, { frame: value[value.length - 1]?.frame ?? "default", ms: 100 }])}>
        + Шаг
      </button>
    </div>
  );
}
