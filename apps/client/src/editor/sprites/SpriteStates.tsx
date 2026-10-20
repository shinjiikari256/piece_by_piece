import { useState } from "react";
import type { CustomSprite, SpriteParam } from "../../../../../shared/case";
import { Select } from "../../ui/Select";
import { editor, editorStore } from "../state";
import { toKey } from "../keys";
import { ClipEditor } from "../fields/ClipEditor";
import { ObjectFields } from "../SchemaForm";
import { formSchema } from "../json-schema";
import { CustomSprite as CustomSpriteSchema } from "../../../../../shared/case";
import { conditionOf, patchSprite, rulesOf, type ParamRule } from "./helpers";

const KIND_LABEL: Record<SpriteParam["kind"], string> = { flag: "флаг", counter: "число", enum: "перечисление" };
const SCHEMA = formSchema(CustomSpriteSchema);

const upd = (sprite: CustomSprite, patch: Partial<CustomSprite>) => editor.update((d) => patchSprite(d, sprite.key, patch), `sprite-vars:${sprite.key}`);

/** Свои переменные спрайта. Состояния зависят от них; к переменным дела их привязывает каждый предмет на карте. */
export function SpriteParams({ sprite }: { sprite: CustomSprite }) {
  const params = sprite.params ?? [];
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SpriteParam["kind"]>("flag");
  const key = toKey(name) || "";
  const free = !!key && !params.some((q) => q.id === key);
  const setParam = (id: string, patch: Partial<SpriteParam>) => upd(sprite, { params: params.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
  const remove = (id: string) => {
    const strip = (c: unknown): unknown => (Array.isArray(c) ? c.map(strip) : c && typeof c === "object" ? Object.fromEntries(Object.entries(c).map(([k, v]) => [k, strip(v)])) : c);
    void strip;
    upd(sprite, { params: params.filter((q) => q.id !== id) });
  };
  return (
    <div className="stack">
      <h3>Переменные спрайта</h3>
      <p className="muted">Это «входы» спрайта, например «Горит» (флаг), «Мощность» (число), «Режим» (перечисление). Какую переменную дела они читают — задаёт предмет на карте.</p>
      {params.map((q) => (
        <fieldset key={q.id} className="ef ef--object">
          <legend>
            {q.name || q.id} <code>{q.id}</code> · {KIND_LABEL[q.kind]}
          </legend>
          <label className="ef">
            <span className="ef__label">Название</span>
            <input value={q.name} onChange={(e) => setParam(q.id, { name: e.target.value })} />
          </label>
          {q.kind === "enum" && (
            <div className="stack">
              {(q.values ?? []).map((v, i) => (
                <div key={i} className="pair">
                  <input value={v.id} aria-label="id значения" disabled title="id значения не меняется" />
                  <input value={v.name} aria-label="Название значения" onChange={(e) => setParam(q.id, { values: (q.values ?? []).map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                  <button className="btn btn--sm btn--icon" aria-label="Убрать значение" onClick={() => setParam(q.id, { values: (q.values ?? []).filter((_, k) => k !== i) })}>
                    ×
                  </button>
                </div>
              ))}
              <AddValue onAdd={(v) => setParam(q.id, { values: [...(q.values ?? []), v] })} taken={(q.values ?? []).map((v) => v.id)} />
            </div>
          )}
          <button className="btn btn--sm btn--danger" onClick={() => remove(q.id)}>
            Удалить переменную
          </button>
        </fieldset>
      ))}
      <div className="pair">
        <input placeholder="Название новой переменной" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={kind} options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} onChange={(v) => setKind(v as SpriteParam["kind"])} />
        <button
          className="btn btn--sm"
          disabled={!free}
          onClick={() => {
            upd(sprite, { params: [...params, { id: key, name: name.trim(), kind, ...(kind === "enum" ? { values: [] } : {}) }] });
            setName("");
          }}
        >
          + Переменная
        </button>
      </div>
    </div>
  );
}

function AddValue({ onAdd, taken }: { onAdd: (v: { id: string; name: string }) => void; taken: string[] }) {
  const [name, setName] = useState("");
  const id = toKey(name);
  return (
    <div className="pair">
      <input placeholder="Новое значение" value={name} onChange={(e) => setName(e.target.value)} />
      <button
        className="btn btn--sm"
        disabled={!id || taken.includes(id)}
        onClick={() => {
          onAdd({ id, name: name.trim() });
          setName("");
        }}
      >
        + Значение
      </button>
    </div>
  );
}

/** Состояния спрайта: первое подходящее по порядку; условие — ограничения на его переменные. */
export function SpriteStates({ sprite }: { sprite: CustomSprite }) {
  const params = sprite.params ?? [];
  const states = sprite.states ?? [];
  const frames = Object.keys(sprite.frames);
  const [name, setName] = useState("");
  const id = toKey(name);
  const set = (i: number, patch: Partial<NonNullable<CustomSprite["states"]>[number]>) => upd(sprite, { states: states.map((st, k) => (k === i ? { ...st, ...patch } : st)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= states.length) return;
    const next = [...states];
    [next[i], next[j]] = [next[j], next[i]];
    upd(sprite, { states: next });
  };
  return (
    <div className="stack">
      <h3>Состояния</h3>
      <p className="muted">Действует первое подходящее по порядку; если ни одно не подошло — кадр «default». Условие без ограничений подходит всегда.</p>
      {states.map((st, i) => {
        const rules = rulesOf(st.when);
        const setRule = (pid: string, rule: ParamRule | undefined) => {
          const next = { ...rules };
          if (rule) next[pid] = rule;
          else delete next[pid];
          set(i, { when: conditionOf(st.when, next, params) });
        };
        return (
          <fieldset key={st.id} className="ef ef--object">
            <legend>
              {i + 1}. <code>{st.id}</code>
            </legend>
            <div className="row">
              <button className="btn btn--sm btn--icon" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="btn btn--sm btn--icon" aria-label="Ниже" disabled={i === states.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button
                className="btn btn--sm btn--danger"
                onClick={() => upd(sprite, { states: states.filter((_, k) => k !== i), transitions: sprite.transitions?.filter((t) => t.from !== st.id && t.to !== st.id), actions: sprite.actions?.filter((a) => a.state !== st.id), timers: sprite.timers?.filter((t) => t.state !== st.id) })}
              >
                Удалить состояние
              </button>
            </div>
            {params.length === 0 && <p className="muted">Условие появится, когда у спрайта будут переменные.</p>}
            {params.map((q) => (
              <RuleRow key={q.id} param={q} rule={rules[q.id]} onChange={(r) => setRule(q.id, r)} />
            ))}
            <div className="ef">
              <span className="ef__label">Кадр</span>
              <Select value={st.frame ?? "default"} options={frames.map((f) => ({ value: f, label: f }))} onChange={(f) => set(i, { frame: f === "default" ? undefined : f })} />
            </div>
            <div className="ef">
              <span className="ef__label">Мешает проходу</span>
              <Select
                value={st.solid === undefined ? "" : st.solid ? "yes" : "no"}
                options={[
                  { value: "", label: "как у спрайта" },
                  { value: "yes", label: "мешает" },
                  { value: "no", label: "не мешает" },
                ]}
                onChange={(v) => set(i, { solid: v === "" ? undefined : v === "yes" })}
              />
            </div>
            <div className="ef">
              <span className="ef__label">Цикл анимации</span>
              {st.loop ? (
                <>
                  <ClipEditor value={st.loop.clip} frames={frames} onChange={(clip) => set(i, { loop: { ...st.loop!, clip } })} />
                  <label className="ef">
                    <span className="ef__label">Пауза между повторами, мс</span>
                    <input type="number" min={0} max={60000} step={100} value={st.loop.pauseMs ?? 0} onChange={(e) => set(i, { loop: { ...st.loop!, pauseMs: Math.max(0, Math.trunc(Number(e.target.value)) || 0) || undefined } })} />
                  </label>
                  <button className="btn btn--sm" onClick={() => set(i, { loop: undefined })}>
                    Убрать цикл
                  </button>
                </>
              ) : (
                <button className="btn btn--sm" onClick={() => set(i, { loop: { clip: [{ frame: st.frame ?? "default", ms: 100 }] } })}>
                  + Цикл
                </button>
              )}
            </div>
          </fieldset>
        );
      })}
      <div className="pair">
        <input placeholder="Название нового состояния" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn btn--sm"
          disabled={!id || states.some((st) => st.id === id) || id === "default"}
          onClick={() => {
            upd(sprite, { states: [...states, { id }] });
            setName("");
          }}
        >
          + Состояние
        </button>
      </div>
      <h3>Анимации</h3>
      <p className="muted">Переходы между состояниями, анимации на осмотр и по таймеру — как у предмета; кадры и состояния берутся из этого спрайта.</p>
      <ObjectFields
        schema={SCHEMA}
        value={sprite}
        only={["transitions", "actions", "timers"]}
        ctx={{ draft: editorStore.get().draft, object: { sprite: sprite.key, states } }}
        onChange={(v) => upd(sprite, v as Partial<CustomSprite>)}
      />
    </div>
  );
}

function RuleRow({ param, rule, onChange }: { param: SpriteParam; rule: ParamRule | undefined; onChange: (r: ParamRule | undefined) => void }) {
  const label = <span className="ef__label">{param.name || param.id}</span>;
  if (param.kind === "flag")
    return (
      <div className="ef">
        {label}
        <Select
          value={rule?.flag === undefined ? "" : rule.flag ? "on" : "off"}
          options={[
            { value: "", label: "любое" },
            { value: "on", label: "установлен" },
            { value: "off", label: "не установлен" },
          ]}
          onChange={(v) => onChange(v === "" ? undefined : { flag: v === "on" })}
        />
      </div>
    );
  if (param.kind === "counter") {
    const num = (v: string) => (v.trim() === "" ? undefined : Math.trunc(Number(v)));
    const fix = (r: ParamRule) => (r.min === undefined && r.max === undefined ? undefined : r);
    return (
      <div className="ef">
        {label}
        <div className="pair">
          <input type="number" placeholder="не меньше" value={rule?.min ?? ""} onChange={(e) => onChange(fix({ ...rule, min: num(e.target.value) }))} />
          <input type="number" placeholder="не больше" value={rule?.max ?? ""} onChange={(e) => onChange(fix({ ...rule, max: num(e.target.value) }))} />
        </div>
      </div>
    );
  }
  const values = rule?.values ?? [];
  return (
    <div className="ef">
      {label}
      <div className="row">
        {(param.values ?? []).map((v) => (
          <button
            key={v.id}
            className="btn btn--sm"
            aria-pressed={values.includes(v.id)}
            onClick={() => {
              const next = values.includes(v.id) ? values.filter((x) => x !== v.id) : [...values, v.id];
              onChange(next.length ? { values: next } : undefined);
            }}
          >
            {v.name || v.id}
          </button>
        ))}
        {!(param.values ?? []).length && <span className="muted">нет значений</span>}
      </div>
    </div>
  );
}
