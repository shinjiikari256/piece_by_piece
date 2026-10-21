import type { CaseFile } from "../../../../../shared/case";
import { KeyInput } from "./KeyInput";
import { ask, tell } from "../../ui/dialog";
import { editor, useEditor } from "../state";
import { countRefs, isEntityKey, renameKey } from "../keys";


/**
 * Ключ элемента. Сам не меняется никогда: только вручную (Enter или уход с поля).
 * Если на ключ ссылаются — подтверждение и переименование во всех местах.
 */
export function KeyField({ value, suggestion, onChange }: { value: string; suggestion: string; onChange: (v: string) => void }) {
  const draft = useEditor((s) => s.draft);
  const commit = async (key: string) => {
    const d = draft as unknown as Record<string, unknown>;
    if (!isEntityKey(d, value)) return onChange(key);
    if (isEntityKey(d, key)) {
      await tell({ title: "Ключ уже занят", text: `«${key}» уже есть в деле — выберите другой.` });
      return false;
    }
    const refs = countRefs(d, value);
    if (refs > 0) {
      const ok = await ask({
        title: "Переименовать ключ?",
        text: `Ключ «${value}» используется в ${refs} мест(ах). Он заменится на «${key}» во всех ссылках.`,
        confirmLabel: "Переименовать",
      });
      if (!ok) return false;
    }
    editor.update((c) => renameKey(c as unknown as Record<string, unknown>, value, key) as unknown as CaseFile);
  };
  return (
    <div className="ef">
      <span className="ef__label">Ключ</span>
      <KeyInput value={value} suggestion={suggestion} commit={commit} />
    </div>
  );
}
