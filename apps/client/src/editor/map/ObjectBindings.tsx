import type { CaseFile, LocationObject } from "../../../../../shared/case";
import { Select } from "../../ui/Select";

const KIND = { flag: "флаг", counter: "счётчик", enum: "перечисление" } as const;

/** Привязка переменных спрайта дела к переменным дела: что читает спрайт у этого предмета. Нужна, пока у предмета нет своих состояний. */
export function ObjectBindings({ draft, object, onChange }: { draft: CaseFile; object: LocationObject; onChange: (o: LocationObject) => void }) {
  const sprite = draft.sprites?.find((s) => s.key === object.sprite);
  if (!sprite?.params?.length) return null;
  const own = !!object.states?.length;
  const options = {
    flag: (draft.flags ?? []).map((f) => ({ value: f.id, label: f.name || f.id })),
    counter: (draft.counters ?? []).map((c) => ({ value: c.id, label: c.name || c.id })),
    enum: (draft.enums ?? []).map((e) => ({ value: e.id, label: e.name || e.id })),
  };
  const set = (id: string, v: string) => {
    const next = { ...object.bindings };
    if (v) next[id] = v;
    else delete next[id];
    onChange({ ...object, bindings: Object.keys(next).length ? next : undefined });
  };
  return (
    <fieldset className="ef ef--object">
      <legend>Переменные спрайта</legend>
      {own && <p className="muted">У предмета есть свои состояния — они главнее состояний спрайта, привязки не действуют.</p>}
      {sprite.params.map((q) => (
        <div key={q.id} className="ef">
          <span className="ef__label">
            {q.name || q.id} ({KIND[q.kind]})
          </span>
          <Select value={object.bindings?.[q.id] ?? ""} options={[{ value: "", label: "не привязано" }, ...options[q.kind]]} onChange={(v) => set(q.id, v)} />
        </div>
      ))}
    </fieldset>
  );
}
