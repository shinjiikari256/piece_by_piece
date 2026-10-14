import { useState, type ReactNode } from "react";
import { editor, useEditor, type Focus } from "../state";
import { countRefs, renameKey, toKey } from "../keys";
import { Select } from "../../ui/Select";
import type { CaseFile } from "../../../../../shared/case";
import { ask } from "../../ui/dialog";
import { Icon } from "../../ui/icons";
import { FormCtx, Option, charOption } from "../SchemaForm";
import { RefMulti } from "./RefChips";

// ---------- условия показа и флаги ----------

export type Condition = {
  evidence?: string[];
  deductions?: string[];
  flags?: string[];
  notFlags?: string[];
  following?: string[];
  notFollowing?: string[];
};

/** Все флаги, которые встречаются в деле: описанные, поставленные эффектами или проверяемые условиями. */
export function flagsOf(d: FormCtx["draft"]): string[] {
  const out = new Set<string>(d.flags?.map((f) => f.id) ?? []);
  const cond = (c?: Condition) => {
    c?.flags?.forEach((f) => out.add(f));
    c?.notFlags?.forEach((f) => out.add(f));
  };
  for (const dl of d.dialogues)
    for (const n of dl.nodes) {
      n.effects.forEach((e) => e.type === "setFlag" && out.add(e.flag));
      n.choices.forEach((ch) => cond(ch.requires));
    }
  d.deductions.forEach((x) => x.effects.forEach((e) => e.type === "setFlag" && out.add(e.flag)));
  d.confrontations.forEach((c) => cond(c.requires));
  d.locations.forEach((l) => l.doors.forEach((door) => cond(door.requires)));
  return [...out].sort();
}

export interface FlagUse {
  kind: "ставит" | "проверяет" | "проверяет отсутствие";
  where: string;
  focus: Focus;
}

/** Где используется каждый флаг — с адресом для перехода. */
export function flagUsage(d: FormCtx["draft"]): Map<string, FlagUse[]> {
  const out = new Map<string, FlagUse[]>();
  const add = (f: string, use: FlagUse) => out.set(f, [...(out.get(f) ?? []), use]);
  const who = (id: string) => d.characters.find((c) => c.id === id)?.name ?? id;
  const dialogueFocus = (dialogueId: string, sub: string): Focus => {
    const conf = d.confrontations.find((c) => c.dialogueId === dialogueId);
    return conf ? { section: "confrontations", id: conf.id, sub } : { section: "dialogues", id: dialogueId, sub };
  };
  const cond = (c: Condition | undefined, where: string, focus: Focus) => {
    c?.flags?.forEach((f) => add(f, { kind: "проверяет", where, focus }));
    c?.notFlags?.forEach((f) => add(f, { kind: "проверяет отсутствие", where, focus }));
  };
  for (const dl of d.dialogues)
    for (const n of dl.nodes) {
      n.effects.forEach(
        (e) => e.type === "setFlag" && add(e.flag, { kind: "ставит", where: `Разговор: ${who(dl.characterId)} — реплика «${n.text.slice(0, 50)}»`, focus: dialogueFocus(dl.id, n.id) }),
      );
      n.choices.forEach((ch) => cond(ch.requires, `Разговор: ${who(dl.characterId)} — вариант «${ch.text.slice(0, 50)}»`, dialogueFocus(dl.id, n.id)));
    }
  d.deductions.forEach((x) =>
    x.effects.forEach((e) => e.type === "setFlag" && add(e.flag, { kind: "ставит", where: `Сопоставление «${x.title}»`, focus: { section: "deductions", id: x.id } })),
  );
  d.confrontations.forEach((x) => cond(x.requires, `Очная ставка «${x.title ?? x.characters.map(who).join(", ")}»`, { section: "confrontations", id: x.id }));
  d.locations.forEach((l) =>
    l.doors.forEach((door) => cond(door.requires, `Дверь ${door.id} — ${l.name}`, { section: "locations", sub: l.id, kind: "door", id: door.id })),
  );
  return out;
}

/** Удалить флаг полностью: эффекты «поставить флаг», проверки в условиях (пустые условия исчезают), запись в списке. */
export function deleteFlag(d: CaseFile, flag: string): CaseFile {
  const clean = <T extends { requires?: Condition }>(x: T): T => {
    if (!x.requires) return x;
    const r: Condition = { ...x.requires };
    for (const k of ["flags", "notFlags"] as const) {
      if (!r[k]) continue;
      r[k] = r[k]!.filter((f) => f !== flag);
      if (!r[k]!.length) delete r[k];
    }
    const { requires: _old, ...rest } = x;
    return (Object.keys(r).length ? { ...rest, requires: r } : rest) as T;
  };
  const noSet = <E extends { type: string; flag?: string }>(effects: E[]) => effects.filter((e) => !(e.type === "setFlag" && e.flag === flag));
  return {
    ...d,
    flags: (d.flags ?? []).filter((f) => f.id !== flag),
    dialogues: d.dialogues.map((dl) => ({
      ...dl,
      nodes: dl.nodes.map((n) => ({ ...n, effects: noSet(n.effects), choices: n.choices.map(clean) })),
    })),
    deductions: d.deductions.map((x) => ({ ...x, effects: noSet(x.effects) })),
    confrontations: d.confrontations.map(clean),
    locations: d.locations.map((l) => ({ ...l, doors: l.doors.map(clean) })),
  };
}

const flagName = (d: FormCtx["draft"], id: string) => d.flags?.find((f) => f.id === id)?.name ?? "";
/** «Разрешён вход в архив (key_412)» — название и ключ в скобках. */
export const flagLabel = (d: FormCtx["draft"], id: string) => (flagName(d, id) ? `${flagName(d, id)} (${id})` : id);

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

/** Окно создания или правки флага: русское название и ключ (собирается из названия). */
export function FlagDialog({ initial, onDone }: { initial?: { id: string; name: string }; onDone: (flag: string | null) => void }) {
  const draft = useEditor((s) => s.draft);
  const [name, setName] = useState(initial?.name ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [manualKey, setManualKey] = useState(!!initial);
  const taken = id !== initial?.id && flagsOf(draft).includes(id);
  const save = async () => {
    const flag = id.trim();
    if (!flag || !name.trim() || taken) return;
    const old = initial?.id;
    if (old && old !== flag) {
      const refs = countRefs(draft as unknown as Record<string, unknown>, old);
      if (refs > 0) {
        const ok = await ask({
          title: "Переименовать ключ флага?",
          text: `Флаг «${old}» используется в ${refs} мест(ах). Ключ заменится на «${flag}» во всех ссылках.`,
          confirmLabel: "Переименовать",
        });
        if (!ok) return;
      }
    }
    editor.update((d0) => {
      const d = old && old !== flag ? (renameKey(d0 as unknown as Record<string, unknown>, old, flag) as unknown as CaseFile) : d0;
      const rest = (d.flags ?? []).filter((f) => f.id !== flag && f.id !== old);
      return { ...d, flags: [...rest, { id: flag, name: name.trim() }].sort((a, b) => a.name.localeCompare(b.name, "ru")) };
    });
    onDone(flag);
  };
  return (
    <div className="ed-modal" onMouseDown={(e) => e.target === e.currentTarget && onDone(null)}>
      <form
        className="ed-modal__box"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h3>{initial ? "Флаг" : "Новый флаг"}</h3>
        <p className="muted">Флаг — пометка «это уже произошло». Её ставят эффекты реплик и сопоставлений, а условия проверяют.</p>
        <label className="ef">
          <span className="ef__label">Название — что означает флаг</span>
          <input
            autoFocus
            value={name}
            placeholder="Тимур отдал ключ от комнаты 412"
            onChange={(e) => {
              setName(e.target.value);
              if (!manualKey) setId(toKey(e.target.value));
            }}
          />
        </label>
        <label className="ef">
          <span className="ef__label">{initial ? "Ключ (смена ключа обновит все ссылки)" : "Ключ (латиницей, собирается из названия)"}</span>
          <input
            className="flag-input"
            value={id}
            placeholder="key_412"
            onChange={(e) => {
              setManualKey(true);
              setId(e.target.value.replace(/[^\w-]+/g, "_").toLowerCase());
            }}
          />
          {taken && <span className="ef__hint is-bad">Такой ключ уже есть</span>}
        </label>
        <div className="ed-modal__actions">
          <button type="button" className="btn btn--sm" onClick={() => onDone(null)}>
            Отмена
          </button>
          <button type="submit" className="btn btn--sm btn--primary" disabled={!id.trim() || !name.trim() || taken}>
            {initial ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Условие показа: только заполненные строки + «+ условие». Все строки должны выполняться. */
export function ConditionEditor({ value, onChange, ctx, label }: { value: Condition; onChange: (v: unknown) => void; ctx: FormCtx; label: ReactNode }) {
  const set = (key: keyof Condition, list: string[]) => {
    const next = { ...value };
    if (list.length) next[key] = list;
    else delete next[key];
    onChange(next);
  };
  const [added, setAdded] = useState<(keyof Condition)[]>([]);
  const d = ctx.draft;
  const chars = d.characters.map(charOption);
  const rows: { key: keyof Condition; title: string; options: Option[] | "flags" }[] = [
    { key: "evidence", title: "Есть улики (все)", options: d.evidence.map((e) => ({ value: e.id, label: e.title })) },
    { key: "deductions", title: "Установлены выводы (все)", options: d.deductions.map((x) => ({ value: x.id, label: x.title })) },
    { key: "flags", title: "Флаги поставлены", options: "flags" },
    { key: "notFlags", title: "Флагов нет", options: "flags" },
    { key: "following", title: "Идут за игроком", options: chars },
    { key: "notFollowing", title: "Не идут за игроком", options: chars },
  ];
  const shown = rows.filter((r) => value[r.key]?.length || added.includes(r.key));
  const free = rows.filter((r) => !shown.includes(r));
  const removeRow = (key: keyof Condition) => {
    setAdded((a) => a.filter((k) => k !== key));
    set(key, []);
  };
  return (
    <fieldset className="ef ef--object cond">
      <legend>{label ?? "Условие показа"}</legend>
      {shown.length === 0 && <p className="cond__hint">Без условия — доступно всегда.</p>}
      {shown.map((r) => {
        const remove = (
          <button className="cond__remove" onClick={() => removeRow(r.key)} title="Убрать строку условия">
            ✕
          </button>
        );
        const title = <span className="cond__title">{r.title}</span>;
        return (
          <div key={r.key} className="cond__row">
            {r.options === "flags" ? (
              <FlagMulti label={title} value={value[r.key] ?? []} onChange={(v) => set(r.key, v)} ctx={ctx} extra={remove} />
            ) : (
              <RefMulti label={title} options={r.options} value={value[r.key] ?? []} onChange={(v) => set(r.key, v as string[])} extra={remove} />
            )}
          </div>
        );
      })}
      {free.length > 0 && (
        <Select
          className="sel--add"
          value=""
          placeholder={shown.length ? "+ ещё условие" : "+ условие"}
          options={free.map((r) => ({ value: r.key, label: r.title }))}
          onChange={(k) => setAdded((a) => [...a, k as keyof Condition])}
        />
      )}
      {shown.length > 1 && <p className="cond__hint">Должны выполняться все строки.</p>}
    </fieldset>
  );
}

function FlagMulti({
  label,
  value,
  onChange,
  ctx,
  extra,
}: {
  label: ReactNode;
  value: string[];
  onChange: (v: string[]) => void;
  ctx: FormCtx;
  extra?: ReactNode;
}) {
  const [dialog, setDialog] = useState<{ edit?: string } | null>(null);
  const d = ctx.draft;
  return (
    <div className="ef ef--refs">
      <div className="ef__refhead row row--wrap">
        {label}
        <Select
          className="sel--add"
          value=""
          placeholder="+ флаг"
          options={flagOptions(d, value)}
          onChange={(f) => (f === NEW_FLAG ? setDialog({}) : onChange([...value, f]))}
        />
        {extra}
      </div>
      {value.length > 0 && (
        <div className="ef__chips row row--wrap">
          {value.map((f) => (
            <span
              key={f}
              className="ef__chip ef__chip--flag"
              title="Двойной клик — изменить название"
              onDoubleClick={() => setDialog({ edit: f })}
            >
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
      <Select
        value={value}
        placeholder="выберите флаг"
        options={flagOptions(d)}
        onChange={(f) => (f === NEW_FLAG ? setDialog("new") : onChange(f))}
      />
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
