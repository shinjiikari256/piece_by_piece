import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Select } from "../../ui/Select";
import type { Condition } from "../../../../../shared/case";
import {
  ARRAY_KEYS,
  LIST_KEYS,
  addAtom,
  conditionToModel,
  describeFormula,
  formulaOf,
  modelToCondition,
  parseFormula,
  removeAtom,
  replaceAtom,
  type ConditionModel,
  type ListKey,
} from "../../../../../shared/condition-formula";
import { Icon } from "../../ui/icons";
import { FormCtx, Option, charOption } from "../SchemaForm";
import { RefMulti } from "./RefChips";
import { FlagDialog } from "./FlagDialog";
import { flagLabel, flagName, flagsOf } from "./variables";

// ---------- условия показа и флаги ----------

export type { Condition };

/** Варианты флагов для списка: «+ Добавить флаг…» первым. */
function flagOptions(d: FormCtx["draft"], exclude: string[] = []): Option[] {
  return [
    { value: NEW_FLAG, label: "+ Добавить флаг…" },
    ...flagsOf(d)
      .filter((f) => !exclude.includes(f))
      .map((f) => ({ value: f, label: flagLabel(d, f) })),
  ];
}
const NEW_FLAG = "__new_flag__";

/** Названия и варианты выбора для строк-списков условия. */
function listRows(d: FormCtx["draft"]): Record<ListKey, { title: string; options: Option[] | "flags" }> {
  const chars = d.characters.map(charOption);
  const locations = d.locations.map((l) => ({ value: l.id, label: l.name }));
  const evidence = d.evidence.map((e) => ({ value: e.id, label: e.title }));
  const deductions = d.deductions.map((x) => ({ value: x.id, label: x.title }));
  return {
    evidence: { title: "Есть улики (все)", options: evidence },
    notEvidence: { title: "Улик нет (ни одной из)", options: evidence },
    deductions: { title: "Установлены выводы (все)", options: deductions },
    notDeductions: { title: "Выводы не установлены (ни одного из)", options: deductions },
    flags: { title: "Флаги поставлены", options: "flags" },
    notFlags: { title: "Флагов нет", options: "flags" },
    following: { title: "Идут за игроком", options: chars },
    notFollowing: { title: "Не идут за игроком", options: chars },
    inLocation: { title: "Игрок в локации (любой из)", options: locations },
    notInLocation: { title: "Игрок не в локациях", options: locations },
  };
}

const ADD_COUNTER = "__counters__";
const ADD_ENUM = "__enums__";
const ADD_CHOSEN = "__chosen__";

/**
 * Условие: пронумерованные строки и, когда их больше одной, формула связки (`1 && (2 || 3)`; можно писать и / или).
 * Без формулы выполняются все строки сразу. Номера — только здесь, в деле их нет (см. `shared/condition-formula.ts`).
 */
export function ConditionEditor({ value, onChange, ctx, label }: { value: Condition; onChange: (v: unknown) => void; ctx: FormCtx; label: ReactNode; nested?: boolean }) {
  const d = ctx.draft;
  const model = useMemo(() => conditionToModel(value), [value]);
  const apply = (m: ConditionModel) => onChange(modelToCondition(m));
  const rows = listRows(d);
  const formula = formulaOf(model.ast);
  const [text, setText] = useState<string | null>(null); // что набирает автор; null — показываем формулу из условия
  useEffect(() => setText(null), [formula]);
  const parsed = text !== null ? parseFormula(text, model.atoms.length) : null;
  const commit = () => {
    if (text === null) return;
    if (parsed?.ok) apply({ atoms: model.atoms, ast: parsed.ast });
    else setText(null);
  };
  const choiceOptions = d.dialogues.flatMap((dl) =>
    dl.nodes.flatMap((n) =>
      n.choices.map((ch) => ({
        value: `${dl.id}/${n.id}/${ch.id}`,
        label: `${d.characters.find((x) => x.id === dl.characterId)?.name ?? dl.characterId}: «${ch.text.slice(0, 45)}» (${n.id})`,
      })),
    ),
  );
  const bound = (v: string) => (v === "" ? undefined : Math.trunc(Number(v)));

  /** Одна строка условия под номером n. */
  const atomRow = (atom: Condition, n: number) => {
    const remove = (
      <button className="cond__remove" onClick={() => apply(removeAtom(model, n))} title="Убрать строку условия">
        ✕
      </button>
    );
    const num = <span className="cond__num">{n}.</span>;
    const listKey = LIST_KEYS.find((k) => atom[k] !== undefined);
    if (listKey) {
      const row = rows[listKey];
      const title = (
        <span className="cond__title">
          {num} {row.title}
        </span>
      );
      const set = (list: unknown) => apply(replaceAtom(model, n, { [listKey]: list as string[] }));
      return row.options === "flags" ? (
        <FlagMulti label={title} value={atom[listKey] ?? []} onChange={set} ctx={ctx} extra={remove} />
      ) : (
        <RefMulti label={title} options={row.options} value={atom[listKey] ?? []} onChange={set} extra={remove} />
      );
    }
    const arrayKey = ARRAY_KEYS.find((k) => atom[k]?.length);
    if (arrayKey === "counters") {
      const r = atom.counters![0];
      const set = (p: Partial<typeof r>) => apply(replaceAtom(model, n, { counters: [{ ...r, ...p }] }));
      return (
        <>
          <span className="cond__title">{num} Значение счётчика</span>
          <div className="cond__counter">
            <Select value={r.counterId} placeholder="какой счётчик" options={(d.counters ?? []).map((x) => ({ value: x.id, label: x.name || x.id }))} onChange={(v) => set({ counterId: v })} />
            <input type="number" value={r.min ?? ""} placeholder="от" onChange={(e) => set({ min: bound(e.target.value) })} />
            <input type="number" value={r.max ?? ""} placeholder="до" onChange={(e) => set({ max: bound(e.target.value) })} />
            {remove}
          </div>
        </>
      );
    }
    if (arrayKey === "enums") {
      const r = atom.enums![0];
      const mode = r.notIn !== undefined ? "notIn" : "in";
      const list = (mode === "in" ? r.in : r.notIn) ?? [];
      const values = (d.enums ?? []).find((x) => x.id === r.enumId)?.values ?? [];
      const set = (next: NonNullable<Condition["enums"]>[number]) => apply(replaceAtom(model, n, { enums: [next] }));
      return (
        <div className="stack">
          <span className="cond__title">{num} Значение перечисления</span>
          <div className="cond__counter">
            <Select value={r.enumId} placeholder="какое перечисление" options={(d.enums ?? []).map((x) => ({ value: x.id, label: x.name || x.id }))} onChange={(v) => set({ enumId: v })} />
            <Select
              value={mode}
              options={[
                { value: "in", label: "одно из" },
                { value: "notIn", label: "не одно из" },
              ]}
              onChange={(m) => set({ enumId: r.enumId, [m]: list })}
            />
            {remove}
          </div>
          <RefMulti label="" options={values.map((v) => ({ value: v.id, label: v.name || v.id }))} value={list} onChange={(v) => set({ enumId: r.enumId, [mode]: v as string[] })} />
        </div>
      );
    }
    if (arrayKey === "chosen") {
      const r = atom.chosen![0];
      const set = (next: NonNullable<Condition["chosen"]>[number]) => apply(replaceAtom(model, n, { chosen: [next] }));
      return (
        <>
          <span className="cond__title">{num} Вариант ответа в разговоре</span>
          <div className="cond__counter">
            <Select
              value={`${r.dialogueId}/${r.nodeId}/${r.choiceId}`}
              placeholder="какой вариант"
              options={choiceOptions}
              onChange={(v) => {
                const [dialogueId, nodeId, choiceId] = v.split("/");
                set({ ...r, dialogueId, nodeId, choiceId });
              }}
            />
            <Select
              value={r.not ? "not" : "yes"}
              options={[
                { value: "yes", label: "уже выбирался" },
                { value: "not", label: "ещё не выбирался" },
              ]}
              onChange={(m) => set({ dialogueId: r.dialogueId, nodeId: r.nodeId, choiceId: r.choiceId, ...(m === "not" ? { not: true } : {}) })}
            />
            {remove}
          </div>
        </>
      );
    }
    return null;
  };

  const addOptions = [
    ...LIST_KEYS.map((k) => ({ value: k as string, label: rows[k].title })),
    { value: ADD_COUNTER, label: "Значение счётчика" },
    ...(d.enums?.length ? [{ value: ADD_ENUM, label: "Значение перечисления" }] : []),
    ...(choiceOptions.length ? [{ value: ADD_CHOSEN, label: "Вариант ответа в разговоре" }] : []),
  ];
  const addRow = (k: string) => {
    const row: Condition =
      k === ADD_COUNTER
        ? { counters: [{ counterId: d.counters?.[0]?.id ?? "" }] }
        : k === ADD_ENUM
          ? { enums: [{ enumId: d.enums?.[0]?.id ?? "", in: [] }] }
          : k === ADD_CHOSEN
            ? { chosen: [{ dialogueId: "", nodeId: "", choiceId: "" }] }
            : { [k]: [] };
    apply(addAtom(model, row));
  };

  return (
    <fieldset className="ef ef--object cond">
      <legend>{label ?? "Условие показа"}</legend>
      {model.atoms.length === 0 && <p className="cond__hint">Без условия — доступно всегда.</p>}
      {model.atoms.map((atom, i) => (
        <div key={i} className="cond__row">
          {atomRow(atom, i + 1)}
        </div>
      ))}
      <Select className="sel--add" value="" placeholder={model.atoms.length ? "+ ещё условие" : "+ условие"} options={addOptions} onChange={addRow} />
      {model.atoms.length > 1 && (
        <label className="cond__formula ef">
          <span className="cond__title">Связка условий</span>
          <input
            className="flag-input"
            value={text ?? formula}
            spellCheck={false}
            placeholder="1 && 2"
            aria-invalid={parsed && !parsed.ok ? true : undefined}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setText(null);
            }}
          />
          {parsed && !parsed.ok ? (
            <span className="ef__hint is-bad">{parsed.error}</span>
          ) : (
            <span className="cond__hint">
              {describeFormula(parsed?.ok ? parsed.ast : model.ast)}. «&&» или «и» — все сразу, «||» или «или» — хотя бы одно; скобки группируют. Каждое условие — один раз.
            </span>
          )}
        </label>
      )}
    </fieldset>
  );
}

function FlagMulti({ label, value, onChange, ctx, extra }: { label: ReactNode; value: string[]; onChange: (v: string[]) => void; ctx: FormCtx; extra?: ReactNode }) {
  const [dialog, setDialog] = useState<{ edit?: string } | null>(null);
  const d = ctx.draft;
  return (
    <div className="ef ef--refs">
      <div className="ef__refhead row row--wrap">
        {label}
        <Select className="sel--add" value="" placeholder="+ флаг" options={flagOptions(d, value)} onChange={(f) => (f === NEW_FLAG ? setDialog({}) : onChange([...value, f]))} />
        {extra}
      </div>
      {value.length > 0 && (
        <div className="ef__chips row row--wrap">
          {value.map((f) => (
            <span key={f} className="ef__chip ef__chip--flag" title="Двойной клик — изменить название" onDoubleClick={() => setDialog({ edit: f })}>
              <span className="ef__chip-label">
                {flagName(d, f) || <span className="is-warn">без названия</span>}
                <code>({f})</code>
              </span>
              <button className="ef__chip-x" onClick={() => onChange(value.filter((x) => x !== f))} aria-label="Убрать">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {dialog && (
        <FlagDialog
          initial={dialog.edit ? { id: dialog.edit, name: flagName(d, dialog.edit) } : undefined}
          onDone={(flag) => {
            if (flag && !dialog.edit && !value.includes(flag)) onChange([...value, flag]);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

/** Одиночный флаг (эффект «поставить флаг»). */
export function FlagPicker({ value, onChange, ctx }: { value: string; onChange: (v: unknown) => void; ctx: FormCtx }) {
  const [dialog, setDialog] = useState<"new" | "edit" | null>(null);
  const d = ctx.draft;
  return (
    <div className="flag-picker row row--wrap">
      <Select value={value} placeholder="выберите флаг" options={flagOptions(d)} onChange={(f) => (f === NEW_FLAG ? setDialog("new") : onChange(f))} />
      {value && (
        <button
          className={`btn btn--sm btn--icon ${flagName(d, value) ? "" : "is-warn"}`}
          onClick={() => setDialog("edit")}
          title={flagName(d, value) ? "Изменить название флага" : "У флага нет названия — задать"}
          aria-label="Название флага"
        >
          <Icon name="pen" size={15} />
        </button>
      )}
      {dialog && (
        <FlagDialog
          initial={dialog === "edit" ? { id: value, name: flagName(d, value) } : undefined}
          onDone={(flag) => {
            if (flag && dialog === "new") onChange(flag);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
