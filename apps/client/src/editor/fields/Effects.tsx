import { useState } from "react";
import { Select } from "../../ui/Select";
import { CellPicker } from "../map/CellPicker";
import type { Effect } from "../../../../../shared/case";
import { ENUM_LABELS } from "../labels";
import { FormCtx, charOption } from "../SchemaForm";
import { FlagPicker } from "./Conditions";

// ---------- эффекты ----------

const EFFECT_TYPES: Effect["type"][] = ["addEvidence", "setFlag", "follow", "stay", "returnHome", "moveTo", "addCharacterNote"];

const blankEffect = (type: Effect["type"], d: FormCtx["draft"]): Effect => {
  const ch = d.characters[0]?.id ?? "";
  switch (type) {
    case "addEvidence":
      return { type, evidenceId: "" };
    case "setFlag":
      return { type, flag: "" };
    case "addCharacterNote":
      return { type, characterId: ch, text: "" };
    case "moveTo":
      return { type, characterId: ch, locationId: d.locations[0]?.id ?? "", x: 0, y: 0 };
    default:
      return { type, characterId: ch };
  }
};

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
            {e.type === "setFlag" && <FlagPicker value={e.flag} onChange={(v) => set(i, { ...e, flag: String(v) })} ctx={ctx} />}
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
                  onChange={(v) => set(i, { ...e, locationId: v, ...(d.locations.find((l) => l.id === v)?.playerStart ?? { x: 0, y: 0 }) })}
                />
                <div className="row">
                  <button className="btn btn--sm" onClick={() => setPicking(i)}>
                    Выбрать клетку на карте…
                  </button>
                  <span className="muted">клетка {e.x}, {e.y}</span>
                </div>
                <input
                  className="input"
                  value={e.failText ?? ""}
                  placeholder="Что скажет, если не сможет дойти (необязательно)"
                  onChange={(ev) => set(i, { ...e, failText: ev.target.value || undefined })}
                />
              </>
            )}
            {e.type === "addCharacterNote" && (
              <textarea rows={2} value={e.text} placeholder="Что запишется в карточку персонажа" onChange={(ev) => set(i, { ...e, text: ev.target.value })} />
            )}
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
