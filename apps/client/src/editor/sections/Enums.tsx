import { useState } from "react";
import type { CaseFile } from "../../../../../shared/case";
import { editor, useEditor } from "../state";
import { countRefs, renameKey, toKey } from "../keys";
import { Select } from "../../ui/Select";
import { ask, tell } from "../../ui/dialog";
import { Dialog } from "../../ui/window";
import { isVariableKeyTaken, type FlagUse } from "../fields/Conditions";
import { UsageList } from "../fields/UsageList";

type EnumDef = NonNullable<CaseFile["enums"]>[number];
type Row = { enumId: string; in?: string[]; notIn?: string[] };

/**
 * Обход дела с правкой эффектов «изменить переменную» и строк условий по перечислениям.
 * `effect` возвращает новый эффект или `null` (убрать); `row` — то же для строки условия.
 */
function walk(node: unknown, hooks: { effect?: (e: Record<string, unknown>) => Record<string, unknown> | null; row?: (r: Row) => Row | null }): unknown {
  if (Array.isArray(node)) {
    const isRows = node.length > 0 && node.every((r) => r && typeof r === "object" && "enumId" in r);
    return node
      .map((x) => {
        if (isRows && hooks.row) return hooks.row(x as Row);
        if (x && typeof x === "object" && (x as { type?: string }).type === "changeVariable" && hooks.effect) {
          const next = hooks.effect(x as Record<string, unknown>);
          return next && walk(next, hooks);
        }
        return walk(x, hooks);
      })
      .filter((x) => x !== null);
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      const next = walk(v, hooks);
      // условие, из которого убрали всё, исчезает целиком
      if (k === "enums" && Array.isArray(next) && !next.length) continue;
      if (k === "requires" && next && typeof next === "object" && !Object.keys(next).length) continue;
      out[k] = next;
    }
    return out;
  }
  return node;
}

const sameList = (a: string[] | undefined, fn: (x: string) => string | null) => {
  if (!a) return undefined;
  const out = a.map(fn).filter((x): x is string => x !== null);
  return out;
};

/** Убрать перечисление: его самого, эффекты по нему и строки условий. */
export function deleteEnum(d: CaseFile, id: string): CaseFile {
  const { enums, ...rest } = d;
  const cleaned = walk(rest, {
    effect: (e) => (e.variableId === id ? null : e),
    row: (r) => (r.enumId === id ? null : r),
  }) as Omit<CaseFile, "enums">;
  const left = (enums ?? []).filter((x) => x.id !== id);
  return (left.length ? { ...cleaned, enums: left } : cleaned) as CaseFile;
}

/** Убрать значение: из списка, из начального, эффекты «выбрать значение» и упоминания в условиях (строка, где значений не осталось, пропадает). */
export function deleteEnumValue(d: CaseFile, enumId: string, valueId: string): CaseFile {
  const { enums, ...rest } = d;
  const cleaned = walk(rest, {
    effect: (e) => (e.variableId === enumId && e.valueId === valueId ? null : e),
    row: (r) => {
      if (r.enumId !== enumId) return r;
      const next: Row = { enumId };
      const inList = sameList(r.in, (x) => (x === valueId ? null : x));
      const notIn = sameList(r.notIn, (x) => (x === valueId ? null : x));
      if (inList?.length) next.in = inList;
      if (notIn?.length) next.notIn = notIn;
      return next.in || next.notIn ? next : null;
    },
  }) as Omit<CaseFile, "enums">;
  return {
    ...cleaned,
    enums: (enums ?? []).map((e) =>
      e.id === enumId ? { ...e, values: e.values.filter((v) => v.id !== valueId), ...(e.initial === valueId ? { initial: undefined } : {}) } : e,
    ),
  } as CaseFile;
}

/** Сменить ключ значения во всех местах: список, начальное, эффекты, условия. */
export function renameEnumValue(d: CaseFile, enumId: string, from: string, to: string): CaseFile {
  const { enums, ...rest } = d;
  const cleaned = walk(rest, {
    effect: (e) => (e.variableId === enumId && e.valueId === from ? { ...e, valueId: to } : e),
    row: (r) => (r.enumId === enumId ? { ...r, ...(r.in ? { in: sameList(r.in, (x) => (x === from ? to : x)) } : {}), ...(r.notIn ? { notIn: sameList(r.notIn, (x) => (x === from ? to : x)) } : {}) } : r),
  }) as Omit<CaseFile, "enums">;
  return {
    ...cleaned,
    enums: (enums ?? []).map((e) =>
      e.id === enumId ? { ...e, values: e.values.map((v) => (v.id === from ? { ...v, id: to } : v)), ...(e.initial === from ? { initial: to } : {}) } : e,
    ),
  } as CaseFile;
}

/** Сколько мест ссылается на значение (эффекты и строки условий). */
function valueRefs(d: CaseFile, enumId: string, valueId: string): number {
  let n = 0;
  walk(d.dialogues, {
    effect: (e) => (n += e.variableId === enumId && e.valueId === valueId ? 1 : 0, e),
    row: (r) => (n += r.enumId === enumId && (r.in?.includes(valueId) || r.notIn?.includes(valueId)) ? 1 : 0, r),
  });
  for (const part of [d.deductions, d.locations, d.evidence]) {
    walk(part, {
      effect: (e) => (n += e.variableId === enumId && e.valueId === valueId ? 1 : 0, e),
      row: (r) => (n += r.enumId === enumId && (r.in?.includes(valueId) || r.notIn?.includes(valueId)) ? 1 : 0, r),
    });
  }
  return n;
}

const keyOf = (s: string) => s.replace(/[^\w-]+/g, "_").toLowerCase();

/** Окно нового перечисления: название, ключ и значения (по одному в строке). */
export function EnumDialog({ onDone }: { onDone: (id: string | null) => void }) {
  const draft = useEditor((s) => s.draft);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [manualKey, setManualKey] = useState(false);
  const [text, setText] = useState("Закрыт\nОткрыт");
  const names = text.split("\n").map((x) => x.trim()).filter(Boolean);
  const taken = !!id && isVariableKeyTaken(draft, id);
  const ready = !!id.trim() && !!name.trim() && names.length > 0 && !taken;
  const save = () => {
    if (!ready) return;
    const used = new Set<string>();
    const values = names.map((n) => {
      let key = toKey(n) || "value";
      for (let i = 2; used.has(key); i++) key = `${toKey(n) || "value"}_${i}`;
      used.add(key);
      return { id: key, name: n };
    });
    editor.update((d) => ({ ...d, enums: [...(d.enums ?? []), { id: id.trim(), name: name.trim(), values }] }));
    onDone(id.trim());
  };
  return (
    <Dialog
      title="Новое перечисление"
      className="dialog--flag"
      onClose={() => onDone(null)}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      actions={
        <>
          <button type="button" className="btn btn--sm" onClick={() => onDone(null)}>
            Отмена
          </button>
          <button type="submit" className="btn btn--sm btn--primary" disabled={!ready}>
            Добавить
          </button>
        </>
      }
    >
      <p className="muted">Перечисление — переменная с одним значением из списка (закрыт / открыт / сломан). Эффекты выбирают значение, условия проверяют его.</p>
      <label className="ef">
        <span className="ef__label">Название — что описывает перечисление</span>
        <input
          autoFocus
          value={name}
          placeholder="Например: Сейф"
          onChange={(e) => {
            setName(e.target.value);
            if (!manualKey) setId(toKey(e.target.value));
          }}
        />
      </label>
      <label className="ef">
        <span className="ef__label">Ключ (латиницей, собирается из названия)</span>
        <input
          className="flag-input"
          value={id}
          placeholder="ключ латиницей"
          onChange={(e) => {
            setManualKey(true);
            setId(keyOf(e.target.value));
          }}
        />
        {taken && <span className="ef__hint is-bad">Такой ключ уже есть</span>}
      </label>
      <label className="ef">
        <span className="ef__label">Значения — по одному в строке; первое действует с начала</span>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
    </Dialog>
  );
}

export function EnumEditor({ def, uses, onRenamed }: { def: EnumDef; uses: FlagUse[]; onRenamed: (id: string) => void }) {
  const draft = useEditor((s) => s.draft);
  const { id, name } = def;
  const [key, setKey] = useState(id);
  const refs = countRefs(draft as unknown as Record<string, unknown>, id);
  const patch = (p: Partial<EnumDef>, merge?: string) => editor.update((d) => ({ ...d, enums: (d.enums ?? []).map((e) => (e.id === id ? { ...e, ...p } : e)) }), merge);
  const commitKey = async () => {
    const next = key.trim();
    if (!next || next === id) return setKey(id);
    if (isVariableKeyTaken(draft, next)) {
      setKey(id);
      return tell({ title: "Такой ключ уже есть", text: `Ключ «${next}» занят — выберите другой.` });
    }
    if (refs > 0) {
      const ok = await ask({ title: "Переименовать ключ перечисления?", text: `Перечисление используется в ${refs} мест(ах). Ключ «${id}» заменится на «${next}» во всех ссылках.`, confirmLabel: "Переименовать" });
      if (!ok) return setKey(id);
    }
    editor.update((d) => renameKey(d as unknown as Record<string, unknown>, id, next) as unknown as CaseFile);
    onRenamed(next);
  };
  const remove = async () => {
    const ok = await ask({
      title: `Удалить перечисление «${name || id}»?`,
      text: refs > 0 ? `Перечисление используется в ${refs} мест(ах): эффекты удалятся, строки условий по нему пропадут.` : "Перечисление нигде не используется.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) editor.update((d) => deleteEnum(d, id));
  };
  const addValue = () => {
    const taken = new Set(def.values.map((v) => v.id));
    let n = def.values.length + 1;
    while (taken.has(`value_${n}`)) n++;
    patch({ values: [...def.values, { id: `value_${n}`, name: `Значение ${n}` }] });
  };
  const removeValue = async (valueId: string) => {
    if (def.values.length <= 1) return tell({ title: "Нужно хотя бы одно значение", text: "Чтобы убрать последнее значение, удалите всё перечисление." });
    const n = valueRefs(draft, id, valueId);
    const ok = await ask({
      title: "Убрать значение?",
      text: n > 0 ? `Значение используется в ${n} мест(ах): эффекты «выбрать значение» удалятся, строки условий потеряют его.` : "Значение нигде не используется.",
      confirmLabel: "Убрать",
      danger: true,
    });
    if (ok) editor.update((d) => deleteEnumValue(d, id, valueId));
  };
  const renameValue = async (valueId: string, next: string) => {
    const clean = keyOf(next.trim());
    if (!clean || clean === valueId) return;
    if (def.values.some((v) => v.id === clean)) return tell({ title: "Такой ключ уже есть", text: `Ключ значения «${clean}» занят — выберите другой.` });
    editor.update((d) => renameEnumValue(d, id, valueId, clean));
  };
  const start = def.initial && def.values.some((v) => v.id === def.initial) ? def.initial : def.values[0]?.id;
  return (
    <div className="flag-ed">
      <label className="ef">
        <span className="ef__label">Название — что описывает перечисление</span>
        <input value={name} placeholder="Название" onChange={(e) => patch({ name: e.target.value }, `enum:${id}`)} />
      </label>
      <label className="ef">
        <span className="ef__label">Ключ (смена обновит все ссылки — с подтверждением)</span>
        <div className="key-field row">
          <input
            className="key-field__input"
            value={key}
            onChange={(e) => setKey(keyOf(e.target.value))}
            onBlur={commitKey}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitKey();
              if (e.key === "Escape") setKey(id);
            }}
          />
        </div>
      </label>
      <div className="ef">
        <span className="ef__label">Значения</span>
        <div className="stack">
          {def.values.map((v) => (
            <div key={v.id} className="row">
              <input
                value={v.name}
                placeholder="Название значения"
                onChange={(e) => patch({ values: def.values.map((x) => (x.id === v.id ? { ...x, name: e.target.value } : x)) }, `enum:${id}:${v.id}`)}
              />
              <input className="flag-input" defaultValue={v.id} key={v.id} title="Ключ значения (Enter — применить, обновит все ссылки)" onBlur={(e) => renameValue(v.id, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
              <button className="btn btn--sm btn--icon" onClick={() => removeValue(v.id)} title="Убрать значение" aria-label="Убрать значение">
                ✕
              </button>
            </div>
          ))}
          <button className="btn btn--sm" onClick={addValue}>
            + значение
          </button>
        </div>
      </div>
      <label className="ef">
        <span className="ef__label">Значение в начале расследования</span>
        <Select value={start ?? ""} options={def.values.map((v) => ({ value: v.id, label: v.name || v.id }))} onChange={(v) => patch({ initial: v })} />
      </label>
      <UsageList uses={uses} />
      <button className="btn btn--danger flag-ed__delete" onClick={remove}>
        Удалить перечисление
      </button>
    </div>
  );
}
