import { useEffect, useState } from "react";
import type { CaseFile } from "../../../../../shared/case";
import { Icon } from "../../ui/icons";
import { ask, tell } from "../../ui/dialog";
import { editor, useEditor } from "../state";
import { countRefs, isEntityKey, renameKey } from "../keys";


/**
 * Ключ элемента. Сам не меняется никогда: только вручную (Enter или уход с поля).
 * Если на ключ ссылаются — подтверждение и переименование во всех местах.
 */
export function KeyField({ value, suggestion, onChange }: { value: string; suggestion: string; onChange: (v: string) => void }) {
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
