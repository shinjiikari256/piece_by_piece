import { useState } from "react";
import { isInteractive, type CaseFile, type Condition, type Effect, type Zone, type ZoneAction } from "../../../../../shared/case";
import { EffectsEditor } from "../fields/Effects";
import { Select } from "../../ui/Select";
import { ENUM_LABELS } from "../labels";
import { moveItem } from "../../util/lists";
import { ConditionEditor } from "../fields/Conditions";
import { CellPicker } from "./CellPicker";
import { firstFloorCell } from "../../content/case-utils";

/** Куда класть игрока в локации по умолчанию: её старт или первая клетка пола. */
const spawnOf = (d: CaseFile, locationId: string) => {
  const l = d.locations.find((x) => x.id === locationId);
  return l ? l.playerStart ?? firstFloorCell(l) : { x: 0, y: 0 };
};

const KIND_LABEL: Record<ZoneAction["kind"], string> = { dialogue: "Диалог", object: "Предмет", effects: "Эффекты", exit: "Выход" };

/** Первое подходящее по порядку действие срабатывает — порядок меняют стрелками. */
export function ZoneActions({ zone, draft, onChange, onFallback }: { zone: Zone; draft: CaseFile; onChange: (actions: ZoneAction[]) => void; onFallback: (fallback: Zone["fallback"]) => void }) {
  const [picking, setPicking] = useState<number | null>(null); // чья точка появления выбирается на карте
  const set = (i: number, a: ZoneAction) => onChange(zone.actions.map((x, k) => (k === i ? a : x)));
  const dialogues = draft.dialogues.map((d) => ({ value: d.id, label: `${draft.characters.find((c) => c.id === d.characterId)?.name ?? d.characterId} · ${d.id}` }));
  const objects = draft.locations.flatMap((l) => l.objects.filter(isInteractive).map((o) => ({ value: o.id, label: `${o.label || o.sprite} · ${l.name}` })));
  const locations = draft.locations.map((l) => ({ value: l.id, label: l.name }));
  const blank = (kind: ZoneAction["kind"]): ZoneAction => {
    if (kind === "dialogue") return { kind, dialogueId: draft.dialogues[0]?.id ?? "" };
    if (kind === "object") return { kind, objectId: objects[0]?.value ?? "" };
    if (kind === "effects") return { kind, effects: [] };
    const to = draft.locations.find((l) => !l.zones.includes(zone))?.id ?? draft.locations[0].id;
    return { kind, to, spawn: spawnOf(draft, to) };
  };

  return (
    <section className="zact stack">
      <h4 title="Срабатывает первое подходящее по порядку">Действия</h4>
      {zone.actions.length === 0 && <p className="muted">Действий нет</p>}
      {zone.actions.map((a, i) => (
        <div key={i} className="zact__item stack">
          <div className="row">
            <b>
              {i + 1}. {KIND_LABEL[a.kind]}
            </b>
            <span className="zact__tools">
              <button className="btn btn--sm btn--icon" disabled={i === 0} onClick={() => onChange(moveItem(zone.actions, i, -1) ?? zone.actions)} title="Выше (сработает раньше)" aria-label="Выше">
                ↑
              </button>
              <button className="btn btn--sm btn--icon" disabled={i === zone.actions.length - 1} onClick={() => onChange(moveItem(zone.actions, i, 1) ?? zone.actions)} title="Ниже" aria-label="Ниже">
                ↓
              </button>
              <button className="btn btn--sm btn--icon" onClick={() => onChange(zone.actions.filter((_, k) => k !== i))} title="Убрать действие" aria-label="Убрать действие">
                ✕
              </button>
            </span>
          </div>
          {a.kind === "dialogue" && <Select value={a.dialogueId} placeholder="какой диалог" options={dialogues} onChange={(v) => set(i, { ...a, dialogueId: v })} />}
          {a.kind === "object" && <Select value={a.objectId} placeholder="какой предмет" options={objects} onChange={(v) => set(i, { ...a, objectId: v })} />}
          {a.kind === "effects" && <EffectsEditor value={a.effects} ctx={{ draft }} onChange={(v) => set(i, { ...a, effects: v as Effect[] })} />}
          {a.kind === "exit" && (
            <>
              <Select
                value={a.to}
                placeholder="куда"
                options={locations}
                onChange={(v) => set(i, { ...a, to: v, spawn: spawnOf(draft, v) })}
              />
              <div className="row">
                <button className="btn btn--sm" onClick={() => setPicking(i)}>
                  Где появится игрок…
                </button>
                <span className="muted">
                  клетка {a.spawn.x}, {a.spawn.y}
                </span>
              </div>
            </>
          )}
          <label className="ef">
            <span className="ef__label">Когда срабатывает</span>
            <Select
              value={a.trigger ?? "use"}
              options={(a.kind === "exit" ? (["use", "enter", "enterEvery"] as const) : (["use", "enter", "enterEvery", "leave"] as const)).map((t) => ({ value: t, label: ENUM_LABELS[t] }))}
              onChange={(v) => {
                const { trigger: _t, ...rest } = a;
                set(i, (v === "use" ? rest : { ...rest, trigger: v }) as ZoneAction);
              }}
            />
          </label>
          <ConditionEditor
            value={(a.requires ?? {}) as Condition}
            ctx={{ draft }}
            label={<span className="ef__label">Условие</span>}
            onChange={(v) => {
              const { requires: _r, ...rest } = a;
              set(i, (Object.keys(v as object).length ? { ...rest, requires: v as Condition } : rest) as ZoneAction);
            }}
          />
          {a.requires && (
            <input
              className="input"
              value={a.lockedText ?? ""}
              placeholder="Что сказать, если условие не выполнено (необязательно)"
              onChange={(ev) => {
                const { lockedText: _l, ...rest } = a;
                set(i, (ev.target.value ? { ...rest, lockedText: ev.target.value } : rest) as ZoneAction);
              }}
            />
          )}
        </div>
      ))}
      <Select
        className="sel--add"
        value=""
        placeholder="+ действие"
        options={(["dialogue", "object", "effects", "exit"] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        onChange={(k) => onChange([...zone.actions, blank(k as ZoneAction["kind"])])}
      />
      {zone.fallback ? (
        <div className="zact__item stack">
          <div className="row">
            <b title="Срабатывает при входе и по клавише взаимодействия, когда ни одно действие не подошло">Запасной ответ</b>
            <button className="btn btn--sm btn--icon" onClick={() => onFallback(undefined)} title="Убрать" aria-label="Убрать запасной ответ">
              ×
            </button>
          </div>
          <input className="input" value={zone.fallback.text ?? ""} placeholder="Что сказать игроку (необязательно)" onChange={(ev) => onFallback({ ...zone.fallback!, text: ev.target.value || undefined })} />
          <EffectsEditor value={zone.fallback.effects} ctx={{ draft }} onChange={(v) => onFallback({ ...zone.fallback!, effects: v as Effect[] })} />
        </div>
      ) : (
        zone.actions.length > 0 && (
          <button className="btn btn--sm" onClick={() => onFallback({ effects: [] })}>
            + Запасной ответ
          </button>
        )
      )}
      {picking !== null && zone.actions[picking]?.kind === "exit" && (
        <CellPicker
          draft={draft}
          loc={draft.locations.find((l) => l.id === (zone.actions[picking] as Extract<ZoneAction, { kind: "exit" }>).to) ?? draft.locations[0]}
          characterId=""
          value={(zone.actions[picking] as Extract<ZoneAction, { kind: "exit" }>).spawn}
          onClose={() => setPicking(null)}
          onPick={(cell) => {
            set(picking, { ...(zone.actions[picking] as Extract<ZoneAction, { kind: "exit" }>), spawn: cell });
            setPicking(null);
          }}
        />
      )}
    </section>
  );
}
