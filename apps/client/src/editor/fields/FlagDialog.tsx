import type { CaseFile } from "../../../../../shared/case";
import { useState } from "react";
import { editor, useEditor } from "../state";
import { countRefs, renameKey, toKey } from "../keys";
import { Dialog } from "../../ui/window";
import { ask } from "../../ui/dialog";
import { isVariableKeyTaken } from "./variables";

/** Окно создания или правки флага: русское название и ключ (собирается из названия). */
export function FlagDialog({ initial, onDone }: { initial?: { id: string; name: string }; onDone: (flag: string | null) => void }) {
  const draft = useEditor((s) => s.draft);
  const [name, setName] = useState(initial?.name ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [manualKey, setManualKey] = useState(!!initial);
  const taken = id !== initial?.id && isVariableKeyTaken(draft, id);
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
    <Dialog
      title={initial ? "Флаг" : "Новый флаг"}
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
          <button type="submit" className="btn btn--sm btn--primary" disabled={!id.trim() || !name.trim() || taken}>
            {initial ? "Сохранить" : "Добавить"}
          </button>
        </>
      }
    >
      <p className="muted">Флаг — пометка «это уже произошло». Её ставят эффекты реплик и сопоставлений, а условия проверяют.</p>
      <label className="ef">
        <span className="ef__label">Название — что означает флаг</span>
        <input
          autoFocus
          value={name}
          placeholder="Название флага"
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
