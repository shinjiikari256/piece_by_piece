import { useState } from "react";
import { Select } from "../../ui/Select";
import { CellPicker } from "../map/CellPicker";
import type { Effect } from "../../../../../shared/case";
import { ENUM_LABELS } from "../labels";
import { FormCtx, charOption } from "../SchemaForm";
import { ConditionEditor, flagLabel, flagsOf, type Condition } from "./Conditions";
import { NewVariableDialog } from "./NewVariable";
import { firstFloorCell } from "../../content/case-utils";

const cellOf = (l: Parameters<typeof firstFloorCell>[0] | undefined) => (l ? l.playerStart ?? firstFloorCell(l) : { x: 0, y: 0 });

// ---------- эффекты ----------

const EFFECT_TYPES: Effect["type"][] = ["addEvidence", "changeVariable", "message", "follow", "stay", "returnHome", "moveTo", "addCharacterNote"];

const blankEffect = (type: Effect["type"], d: FormCtx["draft"]): Effect => {
  const ch = d.characters[0]?.id ?? "";
  switch (type) {
    case "addEvidence":
      return { type, evidenceId: "" };
    case "changeVariable":
      return { type, variableId: "", action: "on" };
    case "message":
      return { type, text: "" };
    case "addCharacterNote":
      return { type, characterId: ch, text: "" };
    case "moveTo":
      return { type, characterId: ch, locationId: d.locations[0]?.id ?? "", x: 0, y: 0 };
    default:
      return { type, characterId: ch };
  }
};

const NEW_VARIABLE = "__new_variable__";
const FLAG_ACTIONS = ["on", "off", "toggle"] as const;
const COUNTER_ACTIONS = ["add", "subtract", "set"] as const;

/** «Изменить переменную»: что меняем (флаг, счётчик или перечисление), как и — для счётчика — на сколько, для перечисления — на какое значение. */
function VariableEffect({ effect, ctx, onChange }: { effect: Extract<Effect, { type: "changeVariable" }>; ctx: FormCtx; onChange: (e: Effect) => void }) {
  const d = ctx.draft;
  const [creating, setCreating] = useState(false);
  const counters = d.counters ?? [];
  const enums = d.enums ?? [];
  const kindOf = (id: string) => (counters.some((c) => c.id === id) ? "counter" : enums.some((x) => x.id === id) ? "enum" : "flag");
  const kind = kindOf(effect.variableId);
  const actions = kind === "counter" ? COUNTER_ACTIONS : FLAG_ACTIONS;
  const pick = (id: string) => {
    const next = kindOf(id);
    if (next === kind && effect.variableId) return onChange({ ...effect, variableId: id });
    if (next === "counter") return onChange({ type: "changeVariable", variableId: id, action: "add", value: 1 });
    if (next === "enum") return onChange({ type: "changeVariable", variableId: id, action: "assign", valueId: enums.find((x) => x.id === id)?.values[0]?.id });
    onChange({ type: "changeVariable", variableId: id, action: "on" });
  };
  const values = enums.find((x) => x.id === effect.variableId)?.values ?? [];
  return (
    <>
      <Select
        value={effect.variableId}
        placeholder="какая переменная"
        options={[
          { value: NEW_VARIABLE, label: "+ Добавить переменную…" },
          ...flagsOf(d).filter((f) => kindOf(f) === "flag").map((f) => ({ value: f, label: `Флаг · ${flagLabel(d, f)}` })),
          ...counters.map((c) => ({ value: c.id, label: `Счётчик · ${c.name || c.id}` })),
          ...enums.map((x) => ({ value: x.id, label: `Перечисление · ${x.name || x.id}` })),
        ]}
        onChange={(v) => (v === NEW_VARIABLE ? setCreating(true) : pick(v))}
      />
      {kind === "enum" ? (
        <Select value={effect.valueId ?? ""} placeholder="какое значение" options={values.map((v) => ({ value: v.id, label: v.name || v.id }))} onChange={(v) => onChange({ ...effect, valueId: v })} />
      ) : (
        <div className="pair">
          <Select value={effect.action} options={actions.map((a) => ({ value: a, label: ENUM_LABELS[a] }))} onChange={(v) => onChange({ ...effect, action: v as typeof effect.action })} />
          {kind === "counter" && <input type="number" value={effect.value ?? 0} onChange={(ev) => onChange({ ...effect, value: Math.trunc(Number(ev.target.value)) || 0 })} />}
        </div>
      )}
      {creating && (
        <NewVariableDialog
          onDone={(id) => {
            if (id) pick(id);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

/** Эффекты списком строк «что произойдёт + с чем», одинаково для реплик и сопоставлений. */
export function EffectsEditor({ value, onChange, ctx }: { value: Effect[]; onChange: (v: unknown) => void; ctx: FormCtx }) {
  const d = ctx.draft;
  const set = (i: number, e: Effect) => onChange(value.map((x, k) => (k === i ? e : x)));
  const chars = d.characters.map(charOption);
  const [picking, setPicking] = useState<number | null>(null); // какой эффект выбирает клетку на карте
  const locations = d.locations.map((l) => ({ value: l.id, label: l.name }));
  const evidence = d.evidence.map((e) => ({ value: e.id, label: e.title }));
  return (
    <div className="fx">
      {value.length === 0 && <p className="cond__hint">Ничего не происходит.</p>}
      {value.map((e, i) => (
        <div key={i} className="fx__row">
          <span className="fx__type">{ENUM_LABELS[e.type]}</span>
          <div className="fx__arg stack">
            {e.type === "addEvidence" && (
              <Select value={e.evidenceId} placeholder="какую улику" options={evidence} onChange={(v) => set(i, { ...e, evidenceId: v })} />
            )}
            {e.type === "changeVariable" && <VariableEffect effect={e} ctx={ctx} onChange={(v) => set(i, v)} />}
            {"characterId" in e && (
              <Select value={e.characterId} placeholder="кто" options={chars} onChange={(v) => set(i, { ...e, characterId: v } as Effect)} />
            )}
            {e.type === "moveTo" && (
              <>
                <Select
                  value={e.locationId}
                  placeholder="в какую локацию"
                  options={locations}
                  // в другой локации прежняя клетка ничего не значит — начинаем со старта игрока
                  onChange={(v) => set(i, { ...e, locationId: v, zoneId: undefined, ...cellOf(d.locations.find((l) => l.id === v)) })}
                />
                <Select
                  value={e.zoneId ?? ""}
                  placeholder="Куда: клетка или область"
                  options={[
                    { value: "", label: "Клетка на карте" },
                    ...(d.locations.find((l) => l.id === e.locationId)?.zones ?? []).map((z) => ({ value: z.id, label: `Область «${z.name}»` })),
                  ]}
                  onChange={(v) => set(i, { ...e, zoneId: v || undefined })}
                />
                {e.zoneId ? (
                  <span className="muted">Встанет на свободную клетку области.</span>
                ) : (
                  <div className="row">
                    <button className="btn btn--sm" onClick={() => setPicking(i)}>
                      Выбрать клетку на карте…
                    </button>
                    <span className="muted">клетка {e.x}, {e.y}</span>
                  </div>
                )}
                <input
                  className="input"
                  value={e.failText ?? ""}
                  placeholder="Что скажет, если не сможет дойти (необязательно)"
                  onChange={(ev) => set(i, { ...e, failText: ev.target.value || undefined })}
                />
              </>
            )}
            {e.type === "message" && (
              <textarea rows={2} value={e.text} placeholder="Что увидит игрок (короткое сообщение на экране)" onChange={(ev) => set(i, { ...e, text: ev.target.value })} />
            )}
            {e.type === "addCharacterNote" && (
              <textarea rows={2} value={e.text} placeholder="Что запишется в карточку персонажа" onChange={(ev) => set(i, { ...e, text: ev.target.value })} />
            )}
            <label className="ef ef--bool">
              <input
                type="checkbox"
                checked={!!e.once}
                onChange={(ev) => {
                  const { once: _old, ...rest } = e;
                  set(i, (ev.target.checked ? { ...rest, once: true } : rest) as Effect);
                }}
              />{" "}
              Только один раз за прохождение
            </label>
            <ConditionEditor
              value={e.requires ?? {}}
              ctx={ctx}
              label="Только если"
              onChange={(v) => {
                const { requires: _old, ...rest } = e;
                set(i, (Object.keys(v as object).length ? { ...rest, requires: v as Condition } : rest) as Effect);
              }}
            />
          </div>
          <button className="cond__remove" onClick={() => onChange(value.filter((_, k) => k !== i))} title="Убрать эффект">
            ✕
          </button>
        </div>
      ))}
      <Select
        className="sel--add"
        value=""
        placeholder="+ эффект"
        options={EFFECT_TYPES.map((t) => ({ value: t, label: ENUM_LABELS[t] }))}
        onChange={(t) => onChange([...value, blankEffect(t as Effect["type"], d)])}
      />
      {picking !== null && value[picking]?.type === "moveTo" && (
        <CellPicker
          draft={d}
          loc={d.locations.find((l) => l.id === (value[picking] as Extract<Effect, { type: "moveTo" }>).locationId) ?? d.locations[0]}
          characterId={(value[picking] as Extract<Effect, { type: "moveTo" }>).characterId}
          value={value[picking] as Extract<Effect, { type: "moveTo" }>}
          onClose={() => setPicking(null)}
          onPick={(cell) => {
            set(picking, { ...(value[picking] as Extract<Effect, { type: "moveTo" }>), ...cell });
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
