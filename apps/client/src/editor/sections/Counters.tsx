import { useState } from "react";
import type { CaseFile } from "../../../../../shared/case";
import { editor, useEditor } from "../state";
import { countRefs, renameKey, toKey } from "../keys";
import { ask, tell } from "../../ui/dialog";
import { Dialog } from "../../ui/window";
import { isVariableKeyTaken, type FlagUse } from "../fields/variables";
import { UsageList } from "../fields/UsageList";
import { KeyInput, keyChars } from "../fields/KeyInput";

type Counter = NonNullable<CaseFile["counters"]>[number];

/** Убрать счётчик из дела: сам счётчик, эффекты «изменить переменную» по нему и строки условий по нему (пустые условия исчезают). */
export function deleteCounter(d: CaseFile, id: string): CaseFile {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.filter((x) => !(x && typeof x === "object" && (x as { type?: string; variableId?: string }).type === "changeVariable" && (x as { variableId?: string }).variableId === id)).map(clean);
    }
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "counters" && Array.isArray(v) && v.every((r) => r && typeof r === "object" && "counterId" in r)) {
          const rest = v.filter((r) => (r as { counterId: string }).counterId !== id);
          if (rest.length) out[k] = rest;
          continue;
        }
        const next = clean(v);
        // условие, из которого убрали всё, исчезает целиком
        if (k === "requires" && next && typeof next === "object" && !Object.keys(next).length) continue;
        out[k] = next;
      }
      return out;
    }
    return node;
  };
  const { counters, ...rest } = d;
  return { ...(clean(rest) as Omit<CaseFile, "counters">), counters: (counters ?? []).filter((x) => x.id !== id) } as CaseFile;
}

/** Окно нового счётчика: название и ключ (собирается из названия, пока его не правили руками). */
export function CounterDialog({ onDone }: { onDone: (id: string | null) => void }) {
  const draft = useEditor((s) => s.draft);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [manualKey, setManualKey] = useState(false);
  const taken = !!id && isVariableKeyTaken(draft, id);
  const ready = !!id.trim() && !!name.trim() && !taken;
  const save = () => {
    if (!ready) return;
    const key = id.trim();
    editor.update((d) => ({ ...d, counters: [...(d.counters ?? []), { id: key, name: name.trim() }] }));
    onDone(key);
  };
  return (
    <Dialog
      title="Новый счётчик"
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
      <p className="muted">Счётчик — число (очки, попытки). Эффекты прибавляют или задают его, условия проверяют границы.</p>
      <label className="ef">
        <span className="ef__label">Название — что считает счётчик</span>
        <input
          autoFocus
          value={name}
          placeholder="Название счётчика"
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
            setId(e.target.value.replace(/[^\w-]+/g, "_").toLowerCase());
          }}
        />
        {taken && <span className="ef__hint is-bad">Такой ключ уже есть</span>}
      </label>
    </Dialog>
  );
}

export function CounterEditor({ counter, uses, onRenamed }: { counter: Counter; uses: FlagUse[]; onRenamed: (id: string) => void }) {
  const draft = useEditor((s) => s.draft);
  const { id, name } = counter;
  const refs = countRefs(draft as unknown as Record<string, unknown>, id);
  const patch = (p: Partial<Counter>, merge?: string) =>
    editor.update((d) => ({ ...d, counters: (d.counters ?? []).map((c) => (c.id === id ? { ...c, ...p } : c)) }), merge);
  const commitKey = async (next: string) => {
    if (isVariableKeyTaken(draft, next)) {
      await tell({ title: "Такой счётчик уже есть", text: `Ключ «${next}» занят — выберите другой.` });
      return false;
    }
    if (refs > 0) {
      const ok = await ask({ title: "Переименовать ключ счётчика?", text: `Счётчик используется в ${refs} мест(ах). Ключ «${id}» заменится на «${next}» во всех ссылках.`, confirmLabel: "Переименовать" });
      if (!ok) return false;
    }
    editor.update((d) => renameKey(d as unknown as Record<string, unknown>, id, next) as unknown as CaseFile);
    onRenamed(next);
  };
  const remove = async () => {
    const ok = await ask({
      title: `Удалить счётчик «${name || id}»?`,
      text: refs > 0 ? `Счётчик используется в ${refs} мест(ах): эффекты удалятся, строки условий по нему пропадут.` : "Счётчик нигде не используется.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) editor.update((d) => deleteCounter(d, id));
  };
  return (
    <div className="flag-ed">
      <label className="ef">
        <span className="ef__label">Название — что считает счётчик</span>
        <input value={name} placeholder="Название счётчика" onChange={(e) => patch({ name: e.target.value }, `counter:${id}`)} />
      </label>
      <div className="ef">
        <span className="ef__label">Ключ (смена обновит все ссылки — с подтверждением)</span>
        <KeyInput value={id} suggestion={name ? toKey(name) : undefined} commit={commitKey} normalize={(v) => keyChars(v).toLowerCase()} />
      </div>
      <label className="ef">
        <span className="ef__label">Значение в начале расследования</span>
        <input type="number" value={counter.initial ?? 0} onChange={(e) => patch({ initial: Math.trunc(Number(e.target.value)) || undefined }, `counter:${id}:initial`)} />
      </label>
      <div className="pair">
        {(["min", "max"] as const).map((k) => (
          <label key={k} className="ef">
            <span className="ef__label">{k === "min" ? "Наименьшее значение" : "Наибольшее значение"}</span>
            <input
              type="number"
              value={counter[k] ?? ""}
              placeholder="без границы"
              onChange={(e) => patch({ [k]: e.target.value === "" ? undefined : Math.trunc(Number(e.target.value)) || 0 }, `counter:${id}:${k}`)}
            />
          </label>
        ))}
      </div>
      <p className="muted">Эффекты не выведут значение за эти границы: лишнее отбрасывается.</p>
      <UsageList uses={uses} />
      <button className="btn btn--danger flag-ed__delete" onClick={remove}>
        Удалить счётчик
      </button>
    </div>
  );
}
