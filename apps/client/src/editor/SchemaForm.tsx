import { ENUM_LABELS, HINTS, LONG_TEXT, labelOf } from "./labels";
import { useState, type ReactNode } from "react";
import { caseKey, toKey } from "./keys";
import { Select } from "../ui/Select";
import { ItemTools } from "./ItemTools";
import { moveItem } from "../util/lists";
import { TilePicker } from "./Pickers";
import { SPRITE_NAMES } from "../game/art";
import type { ClipStep, Effect } from "../../../../shared/case";
import { ClipEditor } from "./fields/ClipEditor";
import { SPRITES } from "../game/art";
import { RefMulti, StringList } from "./fields/RefChips";
import { Condition, ConditionEditor, FlagPicker } from "./fields/Conditions";

/** Поля-списки эффектов: рисуются редактором эффектов. */
const EFFECT_FIELDS = new Set(["effects", "onCollect", "failEffects", "onEnter", "onInteract"]);
import { EffectsEditor } from "./fields/Effects";
import { AttachmentSource } from "./fields/Attachment";
import { frameLabel } from "./sprites/helpers";
export { FlagDialog, deleteFlag, evidenceUsage, flagUsage, type FlagUse } from "./fields/Conditions";

export { type JS, defaultFor, itemTitle } from "./schema-utils";
export { type FormCtx, type Option, charOption } from "./ref-options";
import { defaultFor, isBlank, isNullable, itemTitle, nonNull, discriminatorOf, type JS } from "./schema-utils";
import { refOptions, type FormCtx, type Option } from "./ref-options";
import { KeyField } from "./fields/KeyField";

/**
 * Форма по JSON Schema (из z.toJSONSchema). Понимает объекты, массивы,
 * перечисления, nullable, варианты oneOf (по полю-дискриминатору) и
 * ссылки на другие сущности дела — по имени поля.
 */
interface FieldProps {
  name: string;
  schema: JS;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: FormCtx;
  /** Поле элемента массива — без собственной подписи. */
  bare?: boolean;
}

export function Field({ name, schema, value, onChange, ctx, bare }: FieldProps): ReactNode {
  const hint = HINTS[name];
  const label = bare ? null : (
    <span className="ef__label" title={schema.description}>
      {schema.title ?? labelOf(name)}
      {hint && <span className="ef__hint">{hint}</span>}
    </span>
  );

  if (name === "requires" && (schema.type === "object" || nonNull(schema).type === "object")) {
    return <ConditionEditor value={(value ?? {}) as Condition} onChange={onChange} ctx={ctx} label={label} />;
  }
  const frames = ctx.object ? Object.keys(SPRITES[ctx.object.sprite]?.frames ?? {}) : null;
  if (name === "clip" && schema.type === "array" && frames) {
    return (
      <div className="ef">
        {label}
        <ClipEditor value={(value ?? []) as ClipStep[]} frames={frames} onChange={onChange} />
      </div>
    );
  }
  if (name === "frame" && schema.type === "string" && frames) {
    return (
      <div className="ef">
        {label}
        <Select value={String(value ?? "")} options={frames.map((f) => ({ value: f, label: frameLabel(f) }))} onChange={onChange} />
      </div>
    );
  }
  if ((name === "from" || name === "to" || name === "state") && schema.type === "string" && ctx.object) {
    const ids = [...(name === "state" ? [] : ["*"]), "default", ...(ctx.object.states ?? []).map((st) => st.id)];
    const nice = (v: string) => (v === "*" ? "любое" : v === "default" ? "вид по умолчанию" : v);
    const own = { from: "Из состояния", to: "В состояние", state: "Только в состоянии" }[name];
    return (
      <div className="ef">
        <span className="ef__label" title={schema.description}>{own}</span>
        <Select value={String(value ?? "")} options={ids.map((v) => ({ value: v, label: nice(v) }))} onChange={onChange} />
      </div>
    );
  }
  if (name === "src" && schema.type === "string") {
    return (
      <div className="ef">
        {label}
        <AttachmentSource value={String(value ?? "")} onChange={onChange} />
      </div>
    );
  }
  if (EFFECT_FIELDS.has(name) && schema.type === "array") {
    return (
      <div className="ef">
        {label}
        <EffectsEditor value={(value ?? []) as Effect[]} onChange={onChange} ctx={ctx} />
      </div>
    );
  }
  if (name === "flag" && schema.type === "string") {
    return (
      <div className="ef">
        {label}
        <FlagPicker value={String(value ?? "")} onChange={onChange} ctx={ctx} />
      </div>
    );
  }

  if (isNullable(schema)) {
    const inner = nonNull(schema);
    const on = value !== null && value !== undefined;
    return (
      <div className="ef ef--nullable">
        <label className="ef__toggle">
          <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? defaultFor(inner) : null)} />
          {labelOf(name)}
        </label>
        {on && <Field name={name} schema={inner} value={value} onChange={onChange} ctx={ctx} bare />}
      </div>
    );
  }

  if (schema.oneOf) {
    const variants: JS[] = schema.oneOf;
    const key = discriminatorOf(variants);
    const current = (value as Record<string, unknown> | undefined)?.[key ?? ""];
    const variant = variants.find((v) => v.properties?.[key ?? ""]?.const === current) ?? variants[0];
    return (
      <div className="ef ef--variant">
        {label}
        {key && (
          <Select
            className="sel--inline"
            value={String(current ?? "")}
            options={variants.map((v) => {
              const c = String(v.properties[key].const);
              return { value: c, label: ENUM_LABELS[c] ?? c };
            })}
            onChange={(c) => onChange(defaultFor(variants.find((v) => v.properties[key].const === c)!))}
          />
        )}
        <ObjectFields schema={variant} value={value} onChange={onChange} ctx={ctx} skip={key ? [key] : []} />
      </div>
    );
  }

  if (schema.type === "object") {
    return (
      <fieldset className="ef ef--object">
        {!bare && <legend title={schema.description}>{labelOf(name)}</legend>}
        <ObjectFields schema={schema} value={value} onChange={onChange} ctx={ctx} />
      </fieldset>
    );
  }

  if (schema.type === "array") {
    const items: JS = schema.items;
    const list = (value as unknown[]) ?? [];
    const refs = items.type === "string" ? refOptions(name, ctx, true) : null;
    if (refs) return <RefMulti label={label} options={refs} value={list as string[]} onChange={onChange} />;
    if (items.type === "string" || items.type === "number") {
      return (
        <div className="ef">
          {label}
          <StringList value={list as string[]} onChange={onChange} />
        </div>
      );
    }
    return <ArrayField label={labelOf(name)} items={items} value={list} onChange={onChange} ctx={ctx} name={name} />;
  }

  // облик и спрайт выбираем по картинкам
  if ((name === "look" && schema.enum) || (name === "sprite" && schema.type === "string")) {
    const kind = name === "look" ? "look" : "sprite";
    return (
      <div className="ef">
        {label}
        <TilePicker
          kind={kind}
          ids={name === "sprite" ? Object.keys(SPRITES) : schema.enum}
          value={String(value ?? "")}
          onChange={onChange}
          taken={kind === "look" ? ctx.draft.characters.map((c) => c.look) : []}
        />
      </div>
    );
  }

  const refs = schema.type === "string" ? refOptions(name, ctx, false) : null;
  if (refs || schema.enum) {
    const nice = (v: string) => (name === "sprite" ? SPRITE_NAMES[v] : ENUM_LABELS[v]);
    const opts: Option[] = refs ?? schema.enum.map((v: string) => ({ value: v, label: nice(v) ? `${nice(v)} (${v})` : v }));
    return (
      <div className="ef">
        {label}
        <Select value={String(value ?? "")} options={opts} onChange={onChange} />
      </div>
    );
  }

  switch (schema.type) {
    case "string":
      return (
        <label className="ef">
          {label}
          {LONG_TEXT.has(name) ? (
            <textarea value={String(value ?? "")} rows={name === "details" || name === "introduction" ? 6 : 3} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
          )}
        </label>
      );
    case "number":
    case "integer":
      return (
        <label className="ef ef--num">
          {label}
          <input
            type="number"
            value={Number(value ?? 0)}
            step={schema.type === "integer" ? 1 : "any"}
            onChange={(e) => onChange(schema.type === "integer" ? Math.round(Number(e.target.value)) : Number(e.target.value))}
          />
        </label>
      );
    case "boolean":
      return (
        <label className="ef ef--bool">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {labelOf(name)}
        </label>
      );
    default:
      return <div className="ef">{label}?</div>;
  }
}

export function ObjectFields({
  schema,
  value,
  onChange,
  ctx,
  skip = [],
  only,
}: {
  schema: JS;
  value: unknown;
  onChange: (v: unknown) => void;
  ctx: FormCtx;
  skip?: string[];
  only?: string[];
}) {
  const obj = (value ?? {}) as Record<string, unknown>;
  const required: string[] = schema.required ?? [];
  const keys = Object.keys(schema.properties ?? {}).filter((k) => !skip.includes(k) && k !== "bindings" && (!only || only.includes(k))); // привязки спрайта — свой редактор (map/ObjectBindings)
  // координаты x и y — одной строкой
  const isCell = (k: string) => (k === "x" || k === "y") && schema.properties[k]?.type === "integer";
  const paired = keys.includes("x") && keys.includes("y") && isCell("x") && isCell("y");
  const field = (key: string) => (
    <Field key={key} name={key} schema={schema.properties[key]} value={obj[key]} ctx={ctx} onChange={(v) => onChange({ ...obj, [key]: v })} />
  );
  return (
    <div className="ef__fields">
      {keys.map((key) => {
        if (paired && key === "y") return null;
        if (paired && key === "x")
          return (
            <div key="xy" className="pair pair--xy">
              {field("x")}
              {field("y")}
            </div>
          );
        const sub = schema.properties[key];
        // необязательный список показываем сразу: у него есть своя кнопка «добавить», отдельная «+ Поле» не нужна
        const optional = !required.includes(key) && sub.type !== "array";
        // поле с пометкой always в схеме выводится сразу; пустое значение просто не записывается в дело
        const always = optional && sub.always === true;
        if (optional && !always && obj[key] === undefined) {
          return (
            <button key={key} className="ef__add-optional" onClick={() => onChange({ ...obj, [key]: defaultFor(sub) })}>
              + {sub.title ?? labelOf(key)}
            </button>
          );
        }
        return (
          <div key={key} className={`ef__row ${optional && !always ? "is-optional" : ""}`}>
            {key === "id" && typeof obj.id === "string" ? (
              <KeyField
                value={obj.id}
                suggestion={typeof obj.number === "string" ? caseKey(obj.number) : toKey(String(obj.title ?? obj.name ?? ""))}
                onChange={(v) => onChange({ ...obj, id: v })}
              />
            ) : (
              <Field
                name={key}
                schema={sub}
                value={obj[key]}
                ctx={ctx}
                onChange={(v) => {
                  if (always && isBlank(v)) {
                    const { [key]: _gone, ...rest } = obj;
                    onChange(rest);
                  } else onChange({ ...obj, [key]: v });
                }}
              />
            )}
            {optional && !always && (
              <button
                className="ef__remove-optional"
                title="Убрать поле"
                onClick={() => {
                  const copy = { ...obj };
                  delete copy[key];
                  onChange(copy);
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ArrayField({
  label,
  items,
  value,
  onChange,
  ctx,
  name,
}: {
  label: string;
  items: JS;
  value: unknown[];
  onChange: (v: unknown) => void;
  ctx: FormCtx;
  name: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const move = (i: number, dir: -1 | 1) => {
    const next = moveItem(value, i, dir);
    if (!next) return;
    onChange(next);
    setOpen(i + dir);
  };
  return (
    <div className="ef ef--array">
      <div className="ef__array-head">
        <span className="ef__label">
          {label} <span className="muted">({value.length})</span>
        </span>
        <button
          className="btn btn--sm"
          onClick={() => {
            onChange([...value, defaultFor(items)]);
            setOpen(value.length);
          }}
        >
          + добавить
        </button>
      </div>
      <ul className="ef__items">
        {value.map((item, i) => (
          <li key={i} data-open={open === i || undefined}>
            <div className="ef__item-head">
              <button className="ef__item-title" onClick={() => setOpen(open === i ? null : i)}>
                {open === i ? "▾" : "▸"} {itemTitle(item, i)}
              </button>
              <ItemTools index={i} count={value.length} onMove={(dir) => move(i, dir)} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
            </div>
            {open === i && (
              <div className="ef__item-body">
                <Field
                  name={name}
                  schema={items}
                  value={item}
                  ctx={ctx}
                  bare
                  onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
