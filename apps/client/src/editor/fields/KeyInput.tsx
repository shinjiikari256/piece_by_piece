import { Icon } from "../../ui/icons";
import { useDraftField } from "./useDraftField";

/** Допустимые в ключе символы: всё лишнее становится «_». */
export const keyChars = (s: string) => s.replace(/[^\w-]+/g, "_");

/**
 * Строка ввода ключа: черновик, Enter/уход — применить, Esc — откатить, кнопка «из названия».
 * Что делать с новым ключом (проверки, подтверждение, переименование ссылок), решает `commit`; `false` — ключ отклонён, поле вернёт прежний.
 */
export function KeyInput({
  value,
  suggestion,
  commit,
  normalize = keyChars,
}: {
  value: string;
  suggestion?: string;
  commit: (next: string) => void | boolean | Promise<void | boolean>;
  normalize?: (s: string) => string;
}) {
  const { setText, inputProps } = useDraftField(
    value,
    async (next) => {
      const key = next.trim();
      if (!key || key === value || (await commit(key)) === false) setText(value);
    },
    normalize,
  );
  return (
    <div className="key-field row">
      <input className="key-field__input" aria-label="Ключ" {...inputProps} />
      {suggestion && suggestion !== value && (
        <button className="btn btn--sm btn--icon" onClick={() => void commit(suggestion)} title="Сгенерировать из названия" aria-label="Сгенерировать из названия">
          <Icon name="sparkle" size={16} />
        </button>
      )}
    </div>
  );
}
