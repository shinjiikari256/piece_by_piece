import { type ReactNode } from "react";
import { editor, useEditor } from "../state";
import { refTarget } from "../refs";
import { Select } from "../../ui/kit/Select";
import { Option } from "../SchemaForm";

/** Чип-ссылка на элемент дела: двойной клик — перейти к нему, ПКМ — «Перейти» / «Убрать». */
export function RefChip({ id, option, onRemove, title }: { id: string; option?: Option; onRemove: () => void; title?: string }) {
  const draft = useEditor((s) => s.draft);
  const target = refTarget(draft, id);
  return (
    <span
      className={`ef__chip ${option ? "" : "is-broken"} ${option?.art ? "has-art" : ""}`}
      data-ref-id={id}
      data-ref-label={option?.label ?? id}
      title={title ?? (target ? "Двойной клик — перейти" : undefined)}
      onDoubleClick={() => target && editor.goto(target.section, target)}
    >
      {option?.art && <span className="ef__chip-art">{option.art}</span>}
      <span className="ef__chip-label">{option?.label ?? `⚠ ${id}`}</span>
      <button className="ef__chip-x" onClick={onRemove} aria-label="Убрать">
        ✕
      </button>
    </span>
  );
}

/** Ссылки на несколько элементов: строка «подпись + добавить», ниже — выбранные чипы. */
export function RefMulti({ label, options, value, onChange, extra }: { label: ReactNode; options: Option[]; value: string[]; onChange: (v: unknown) => void; extra?: ReactNode }) {
  const rest = options.filter((o) => !value.includes(o.value));
  return (
    <div className="ef ef--refs">
      <div className="ef__refhead row row--wrap">
        {label}
        {rest.length > 0 && <Select className="sel--add" value="" placeholder="+ добавить" options={rest} onChange={(v) => onChange([...value, v])} />}
        {extra}
      </div>
      {value.length > 0 && (
        <div className="ef__chips row row--wrap">
          {value.map((v) => (
            <RefChip key={v} id={v} option={options.find((o) => o.value === v)} onRemove={() => onChange(value.filter((x) => x !== v))} />
          ))}
        </div>
      )}
    </div>
  );
}

export function StringList({ value, onChange }: { value: string[]; onChange: (v: unknown) => void }) {
  return (
    <div className="ef__strings">
      {value.map((v, i) => (
        <div key={i} className="ef__string-row">
          <input value={v} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="btn btn--sm btn--danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button className="btn btn--sm" onClick={() => onChange([...value, ""])}>
        + строка
      </button>
    </div>
  );
}
