import { ENUM_LABELS, HINTS, LONG_TEXT, labelOf } from "./labels";
import { Icon } from "../ui/icons";
import { useEffect, useState, type ReactNode } from "react";
import { editor, useEditor } from "./state";
import { caseKey, countRefs, isEntityKey, renameKey, toKey } from "./keys";
import { Select } from "../ui/Select";
import { ItemTools } from "./ItemTools";
import { moveItem } from "../util/lists";
import { ArtThumb, TilePicker } from "./Pickers";
import { SPRITE_NAMES, resolveLook } from "../game/art";
import type { CaseFile, Dialogue, Effect } from "../../../../shared/case";
import { ask, tell } from "../ui/dialog";
import { RefMulti, StringList } from "./fields/RefChips";
import { Condition, ConditionEditor, FlagPicker } from "./fields/Conditions";

/** Поля-списки эффектов: рисуются редактором эффектов. */
const EFFECT_FIELDS = new Set(["effects", "onCollect", "failEffects", "onEnter", "onInteract"]);
import { EffectsEditor } from "./fields/Effects";
import { AttachmentSource } from "./fields/Attachment";
export { FlagDialog, deleteFlag, evidenceUsage, flagUsage, type FlagUse } from "./fields/Conditions";

/**
 * Форма по JSON Schema (из z.toJSONSchema). Понимает объекты, массивы,
 * перечисления, nullable, варианты oneOf (по полю-дискриминатору) и
 * ссылки на другие сущности дела — по имени поля.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JS = any;

export interface FormCtx {
  draft: CaseFile;
  /** Диалог, внутри которого редактируем (для ссылок на узлы). */
  dialogue?: Dialogue;
}

/** Персонаж в списках и чипах — всегда с портретом. */
export type Option = { value: string; label: string; art?: ReactNode };

export const charOption = (c: CaseFile["characters"][number]): Option => ({
  value: c.id,
  label: c.name,
  art: <ArtThumb kind="look" id={c.look} look={resolveLook(c)} scale={1} />,
});

/** Варианты для полей-ссылок. null — поле не ссылочное. */
function refOptions(name: string, ctx: FormCtx, isArrayItem: boolean): Option[] | null {
  const d = ctx.draft;
  const chars = () => d.characters.map(charOption);
  const ev = () => d.evidence.map((e) => ({ value: e.id, label: `${e.title} (${e.id})` }));
  switch (name) {
    case "characterId":
    case "speaker":
    case "responsibleCharacter":
    case "relatedCharacters":
    case "following":
    case "notFollowing":
      return chars();
    case "characters":
      return isArrayItem ? chars() : null;
    case "evidenceId":
      return ev();
    case "evidenceIds":
      // в сопоставлении можно брать и установленные факты — цепочкой; предметы (ключ, фонарь) уликами не считаются
      return [...d.evidence.filter((e) => e.kind !== "item").map((e) => ({ value: e.id, label: `${e.title} (${e.id})` })), ...d.deductions.map((x) => ({ value: x.id, label: `Вывод: ${x.title} (${x.id})` }))];
    case "evidence":
    case "notEvidence":
      return isArrayItem ? ev() : null;
    case "notDeductions":
      return isArrayItem ? d.deductions.map((x) => ({ value: x.id, label: `${x.title} (${x.id})` })) : null;
    case "deductions":
      return isArrayItem ? d.deductions.map((x) => ({ value: x.id, label: `${x.title} (${x.id})` })) : null;
    case "relatedEvents":
      return d.events.map((e) => ({ value: e.id, label: `${e.time} — ${e.title}` }));
    case "right":
    case "topic":
      // права — варианты вопроса категории «right» самого дела
      return (d.questions.find((q) => q.category === "right")?.options ?? []).map((o) => ({ value: o.id, label: o.label || o.id }));
    case "dialogueId":
      return d.dialogues.map((x) => ({ value: x.id, label: x.id }));
    case "to":
      return d.locations.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }));
    case "startNodeId":
    case "next":
      return ctx.dialogue ? ctx.dialogue.nodes.map((n) => ({ value: n.id, label: `${n.id}: ${n.text.slice(0, 40)}` })) : null;
    default:
      return null;
  }
}

const isNullable = (s: JS) =>
  (Array.isArray(s.type) && s.type.includes("null")) || (Array.isArray(s.anyOf) && s.anyOf.some((x: JS) => x.type === "null"));

const nonNull = (s: JS): JS => {
  if (Array.isArray(s.type)) return { ...s, type: s.type.find((t: string) => t !== "null") };
  if (Array.isArray(s.anyOf)) return { ...s.anyOf.find((x: JS) => x.type !== "null"), description: s.description };
  return s;
};

const discriminatorOf = (variants: JS[]) =>
  Object.keys(variants[0]?.properties ?? {}).find((k) => variants.every((v: JS) => v.properties?.[k]?.const !== undefined));

/** Значение по умолчанию для новой записи. */
/** Пустое значение необязательного поля: его не пишем в дело. */
function isBlank(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(isBlank);
  return false;
}

export function defaultFor(s: JS): unknown {
  if (isNullable(s)) return null;
  if (s.oneOf) return defaultFor(s.oneOf[0]);
  if (s.const !== undefined) return s.const;
  if (s.enum) return s.enum[0];
  switch (s.type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const key of s.required ?? []) out[key] = defaultFor(s.properties[key]);
      return out;
    }
    case "array":
      return [];
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

export function itemTitle(item: unknown, index: number): string {
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    // эффекты: «поставить флаг: x», «добавить улику в дело: e1»
    if (typeof o.type === "string" && ENUM_LABELS[o.type]) {
      const arg = o.flag ?? o.evidenceId ?? o.characterId;
      return arg ? `${ENUM_LABELS[o.type]}: ${String(arg)}` : ENUM_LABELS[o.type];
    }
    const main = o.title ?? o.name ?? o.text ?? o.label ?? o.prompt ?? o.question;
    const id = o.id ?? o.evidenceId ?? o.characterId;
    const head = typeof main === "string" && main ? main.slice(0, 50) : "";
    if (id && head) return `${head} · ${id}`;
    if (id) return String(id);
    if (head) return head;
    if (o.type) return String(o.type);
  }
  if (typeof item === "string") return item || "(пусто)";
  return `#${index + 1}`;
}

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
  if ((name === "look" || name === "sprite") && schema.enum) {
    const kind = name === "look" ? "look" : "sprite";
    return (
      <div className="ef">
        {label}
        <TilePicker
          kind={kind}
          ids={schema.enum}
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

/**
 * Ключ элемента. Сам не меняется никогда: только вручную (Enter или уход с поля).
 * Если на ключ ссылаются — подтверждение и переименование во всех местах.
 */
function KeyField({ value, suggestion, onChange }: { value: string; suggestion: string; onChange: (v: string) => void }) {
  const draft = useEditor((s) => s.draft);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = async (next: string) => {
    const key = next.trim();
    if (!key || key === value) return setText(value);
    const d = draft as unknown as Record<string, unknown>;
    if (!isEntityKey(d, value)) return onChange(key);
    if (isEntityKey(d, key)) {
      setText(value);
      return tell({ title: "Ключ уже занят", text: `«${key}» уже есть в деле — выберите другой.` });
    }
    const refs = countRefs(d, value);
    if (refs > 0) {
      const ok = await ask({
        title: "Переименовать ключ?",
        text: `Ключ «${value}» используется в ${refs} мест(ах). Он заменится на «${key}» во всех ссылках.`,
        confirmLabel: "Переименовать",
      });
      if (!ok) return setText(value);
    }
    editor.update((c) => renameKey(c as unknown as Record<string, unknown>, value, key) as unknown as CaseFile);
  };
  return (
    <div className="ef">
      <span className="ef__label">Ключ</span>
      <div className="key-field row">
        <input
          className="key-field__input"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\w-]+/g, "_"))}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(text);
            if (e.key === "Escape") setText(value);
          }}
        />
        {suggestion && suggestion !== value && (
          <button className="btn btn--sm btn--icon" onClick={() => commit(suggestion)} title="Сгенерировать из названия" aria-label="Сгенерировать из названия">
            <Icon name="sparkle" size={16} />
          </button>
        )}
      </div>
    </div>
  );
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
  const keys = Object.keys(schema.properties ?? {}).filter((k) => !skip.includes(k) && (!only || only.includes(k)));
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
