import { useEffect, useRef, useState } from "react";
import { CustomSprite as CustomSpriteSchema, type CustomSprite, type SpriteParam } from "../../../../../shared/case";
import { drawSprite, specOf } from "../../game/art";
import { Icon, type IconName } from "../../ui/kit/icons";
import { Select } from "../../ui/kit/Select";
import { ask } from "../../ui/kit/dialog";
import { ClipEditor } from "../fields/ClipEditor";
import { ObjectFields } from "../SchemaForm";
import { formSchema } from "../json-schema";
import { toKey } from "../keys";
import { editor, editorStore } from "../state";
import { Check, NumField } from "./SpritePanels";
import { describeRules, conditionOf, frameLabel, patchSprite, rulesOf, uniqueKey, withoutParam, type ParamRule } from "./helpers";

const KINDS: { id: SpriteParam["kind"]; icon: IconName; label: string; hint: string }[] = [
  { id: "flag", icon: "flag", label: "Да / нет", hint: "Например, «Горит»" },
  { id: "counter", icon: "counter", label: "Число", hint: "Например, «Заряд»" },
  { id: "enum", icon: "list", label: "Один из списка", hint: "Например, «Режим»: закрыт, открыт, сломан" },
];
const kindOf = (k: SpriteParam["kind"]) => KINDS.find((x) => x.id === k)!;
const SCHEMA = formSchema(CustomSpriteSchema);

const upd = (sprite: CustomSprite, patch: Partial<CustomSprite>) => editor.update((d) => patchSprite(d, sprite.key, patch), `sprite-vars:${sprite.key}`);

/** Миниатюра кадра спрайта. */
export function FrameThumb({ sprite, frame, scale = 2 }: { sprite: CustomSprite; frame: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, sprite.w, sprite.h);
    drawSprite(ctx, specOf(sprite), sprite.frames[frame] ? frame : "default");
  }, [sprite, frame]);
  return <canvas ref={ref} width={sprite.w} height={sprite.h} className="art-thumb sprite-thumb" style={{ width: sprite.w * scale, height: sprite.h * scale }} />;
}

/** Вкладка «Переменные»: от чего зависит вид спрайта. */
export function SpriteParams({ sprite }: { sprite: CustomSprite }) {
  const params = sprite.params ?? [];
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SpriteParam["kind"]>("flag");
  const setParam = (id: string, patch: Partial<SpriteParam>) => upd(sprite, { params: params.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
  const add = () => {
    const id = uniqueKey(toKey(name) || "var", (k) => params.some((q) => q.id === k));
    upd(sprite, { params: [...params, { id, name: name.trim(), kind, ...(kind === "enum" ? { values: [] } : {}) }] });
    setName("");
  };
  const remove = async (q: SpriteParam) => {
    if (!(await ask({ title: `Удалить переменную «${q.name || q.id}»?`, text: "Она пропадёт из условий состояний и привязок предметов.", confirmLabel: "Удалить", danger: true }))) return;
    editor.update((d) => ({
      ...patchSprite(d, sprite.key, withoutParam(sprite, q.id)),
      locations: d.locations.map((l) => ({
        ...l,
        objects: l.objects.map((o) => {
          if (o.sprite !== sprite.key || !o.bindings?.[q.id]) return o;
          const { [q.id]: _gone, ...rest } = o.bindings;
          return { ...o, bindings: Object.keys(rest).length ? rest : undefined };
        }),
      })),
    }));
  };
  return (
    <div className="stack">
      <p className="muted">
        Переменная — то, от чего зависит вид предмета: например, «Горит» (да / нет), «Заряд» (число) или «Режим» (один из списка). Что именно она значит в деле, вы укажете предмету на карте, когда
        поставите его.
      </p>
      {params.map((q) => (
        <fieldset key={q.id} className="sprite-card">
          <div className="sprite-card__head">
            <span className="sprite-card__icon" title={kindOf(q.kind).label}>
              <Icon name={kindOf(q.kind).icon} size={16} />
            </span>
            <input aria-label="Название переменной" value={q.name} placeholder="Название" onChange={(e) => setParam(q.id, { name: e.target.value })} />
            <button className="btn btn--sm btn--icon" aria-label="Удалить переменную" title="Удалить переменную" onClick={() => remove(q)}>
              <Icon name="trash" size={15} />
            </button>
          </div>
          <small className="muted">{kindOf(q.kind).label}</small>
          {q.kind === "enum" && <EnumValues param={q} onChange={(values) => setParam(q.id, { values })} />}
        </fieldset>
      ))}
      <fieldset className="sprite-card sprite-card--new">
        <legend>Новая переменная</legend>
        <input placeholder="Название, например «Горит»" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && add()} />
        <div className="sprite-tools">
          {KINDS.map((k) => (
            <button key={k.id} className="btn btn--sm" aria-pressed={kind === k.id} title={k.hint} onClick={() => setKind(k.id)}>
              <Icon name={k.icon} size={15} /> {k.label}
            </button>
          ))}
        </div>
        <button className="btn btn--sm btn--primary" disabled={!name.trim()} onClick={add}>
          <Icon name="plus" size={15} /> Добавить переменную
        </button>
      </fieldset>
    </div>
  );
}

function EnumValues({ param, onChange }: { param: SpriteParam; onChange: (v: { id: string; name: string }[]) => void }) {
  const values = param.values ?? [];
  const [text, setText] = useState("");
  const add = () => {
    const n = text.trim();
    if (!n) return;
    onChange([...values, { id: uniqueKey(toKey(n) || "value", (k) => values.some((v) => v.id === k)), name: n }]);
    setText("");
  };
  return (
    <div className="stack">
      {values.map((v, i) => (
        <div key={v.id} className="row">
          <input aria-label="Название значения" value={v.name} onChange={(e) => onChange(values.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
          <button className="btn btn--sm btn--icon" aria-label="Убрать значение" onClick={() => onChange(values.filter((_, k) => k !== i))}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <div className="row">
        <input placeholder="Новое значение, например «закрыт»" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn--sm btn--icon" aria-label="Добавить значение" disabled={!text.trim()} onClick={add}>
          <Icon name="plus" size={15} />
        </button>
      </div>
    </div>
  );
}

/** Вкладка «Состояния»: как выглядит спрайт при разных значениях переменных. */
export function SpriteStates({ sprite }: { sprite: CustomSprite }) {
  const params = sprite.params ?? [];
  const states = sprite.states ?? [];
  const frames = Object.keys(sprite.frames);
  const [name, setName] = useState("");
  const set = (i: number, patch: Partial<NonNullable<CustomSprite["states"]>[number]>) => upd(sprite, { states: states.map((st, k) => (k === i ? { ...st, ...patch } : st)) });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...states];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    upd(sprite, { states: next });
  };
  const add = () => {
    const id = uniqueKey(toKey(name) || "state", (k) => k === "default" || states.some((st) => st.id === k));
    upd(sprite, { states: [...states, { id, name: name.trim(), frame: frames.find((f) => f !== "default") }] });
    setName("");
  };
  const remove = (i: number) => {
    const id = states[i].id;
    upd(sprite, {
      states: states.filter((_, k) => k !== i),
      transitions: sprite.transitions?.filter((t) => t.from !== id && t.to !== id),
      actions: sprite.actions?.filter((a) => a.state !== id),
      timers: sprite.timers?.filter((t) => t.state !== id),
    });
  };
  return (
    <div className="stack">
      <p className="muted">
        Состояние — вид спрайта при определённых значениях переменных. Проверяются сверху вниз, показывается первое подходящее; если подходящих нет — основной кадр. Порядок меняют стрелки.
      </p>
      {states.map((st, i) => {
        const rules = rulesOf(st.when);
        const setRule = (pid: string, rule: ParamRule | undefined) => {
          const next = { ...rules };
          if (rule) next[pid] = rule;
          else delete next[pid];
          set(i, { when: conditionOf(st.when, next, params) });
        };
        return (
          <fieldset key={st.id} className="sprite-card">
            <div className="sprite-card__head">
              <span className="sprite-card__icon" title={`Состояние №${i + 1}`}>
                <Icon name="bolt" size={16} />
              </span>
              <input aria-label="Название состояния" value={st.name ?? ""} placeholder={`Состояние ${i + 1}`} onChange={(e) => set(i, { name: e.target.value })} />
              <button className="btn btn--sm btn--icon" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="btn btn--sm btn--icon" aria-label="Ниже" disabled={i === states.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button className="btn btn--sm btn--icon" aria-label="Удалить состояние" title="Удалить состояние" onClick={() => remove(i)}>
                <Icon name="trash" size={15} />
              </button>
            </div>
            <small className="muted">Когда: {describeRules(params, rules)}</small>
            {params.length === 0 ? (
              <p className="muted">Условие появится, когда во вкладке «Переменные» будет хотя бы одна переменная.</p>
            ) : (
              params.map((q) => <RuleRow key={q.id} param={q} rule={rules[q.id]} onChange={(r) => setRule(q.id, r)} />)
            )}
            <div className="sprite-state-view">
              <FrameThumb sprite={sprite} frame={st.frame ?? "default"} scale={3} />
              <div className="stack">
                <div className="ef">
                  <span className="ef__label">Кадр</span>
                  <Select value={st.frame ?? "default"} options={frames.map((f) => ({ value: f, label: frameLabel(f) }))} onChange={(f) => set(i, { frame: f === "default" ? undefined : f })} />
                </div>
                <div className="ef">
                  <span className="ef__label">Проходимость</span>
                  <Select
                    value={st.solid === undefined ? "" : st.solid ? "yes" : "no"}
                    options={[
                      { value: "", label: "Как у спрайта" },
                      { value: "yes", label: "Мешает проходу" },
                      { value: "no", label: "Не мешает" },
                    ]}
                    onChange={(v) => set(i, { solid: v === "" ? undefined : v === "yes" })}
                  />
                </div>
              </div>
            </div>
            <Check checked={!!st.loop} onChange={(on) => set(i, { loop: on ? { clip: [{ frame: st.frame ?? "default", ms: 200 }] } : undefined })} hint="Кадры сменяют друг друга по кругу.">
              Анимация по кругу
            </Check>
            {st.loop && (
              <div className="stack">
                <ClipEditor value={st.loop.clip} frames={frames} onChange={(clip) => set(i, { loop: { ...st.loop!, clip } })} />
                <NumField label="Пауза между кругами" value={st.loop.pauseMs ?? 0} min={0} max={60000} suffix="мс" onChange={(v) => set(i, { loop: { ...st.loop!, pauseMs: v || undefined } })} />
              </div>
            )}
          </fieldset>
        );
      })}
      <fieldset className="sprite-card sprite-card--new">
        <legend>Новое состояние</legend>
        <input placeholder="Название, например «Включён»" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && add()} />
        <button className="btn btn--sm btn--primary" disabled={!name.trim()} onClick={add}>
          <Icon name="plus" size={15} /> Добавить состояние
        </button>
      </fieldset>
    </div>
  );
}

/** Вкладка «Анимации»: переходы между состояниями, анимации на осмотр и по таймеру. */
export function SpriteAnims({ sprite }: { sprite: CustomSprite }) {
  return (
    <div className="stack">
      <p className="muted">Короткие анимации поверх состояний: переход (например, дверь открывается), реакция на осмотр и повтор по таймеру (мигание). Кадры и состояния берутся из этого спрайта.</p>
      <ObjectFields
        schema={SCHEMA}
        value={sprite}
        only={["transitions", "actions", "timers"]}
        ctx={{ draft: editorStore.get().draft, object: { sprite: sprite.key, states: sprite.states ?? [] } }}
        onChange={(v) => upd(sprite, v as Partial<CustomSprite>)}
      />
    </div>
  );
}

function RuleRow({ param, rule, onChange }: { param: SpriteParam; rule: ParamRule | undefined; onChange: (r: ParamRule | undefined) => void }) {
  const label = (
    <span className="ef__label">
      <Icon name={kindOf(param.kind).icon} size={13} /> {param.name || param.id}
    </span>
  );
  if (param.kind === "flag")
    return (
      <div className="ef">
        {label}
        <Select
          value={rule?.flag === undefined ? "" : rule.flag ? "on" : "off"}
          options={[
            { value: "", label: "Не важно" },
            { value: "on", label: "Да" },
            { value: "off", label: "Нет" },
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
        <div className="row">
          <span className="muted">от</span>
          <input type="number" aria-label="Не меньше" value={rule?.min ?? ""} onChange={(e) => onChange(fix({ ...rule, min: num(e.target.value) }))} />
          <span className="muted">до</span>
          <input type="number" aria-label="Не больше" value={rule?.max ?? ""} onChange={(e) => onChange(fix({ ...rule, max: num(e.target.value) }))} />
        </div>
      </div>
    );
  }
  const values = rule?.values ?? [];
  return (
    <div className="ef">
      {label}
      <div className="row sprite-chips">
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
        {!(param.values ?? []).length && <span className="muted">Сначала добавьте значения переменной</span>}
      </div>
    </div>
  );
}
