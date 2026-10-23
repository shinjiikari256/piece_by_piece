import { OFFLINE_VARIANT_LABEL, type OfflineVariant } from "../../../../../../shared/api";
import type { CaseRow, VariantStatus } from "./use-offline-build";

const VARIANT_HINT: Record<OfflineVariant, string> = {
  game: "Как у студентов: дела можно проходить, результат сохраняется файлом. Без входа, личного кабинета и конструктора.",
  editor: "Игра и конструктор: дела можно править, черновики хранятся в браузере. Кнопка «Запустить» открывает дело в игре.",
};

/** Вариант файла: название, подсказка и пометка, если шаблон не собран на сервере. */
export function VariantOption({ variant, checked, status, onSelect }: { variant: OfflineVariant; checked: boolean; status: VariantStatus; onSelect: () => void }) {
  return (
    <label className="form__check">
      <input type="radio" name="variant" checked={checked} disabled={status !== "ready"} onChange={onSelect} />
      <span className="stack">
        <b>{OFFLINE_VARIANT_LABEL[variant]}</b>
        <span className="muted small">{status === "missing" ? "не подготовлен на сервере" : VARIANT_HINT[variant]}</span>
      </span>
    </label>
  );
}

/** Строка дела в списке выбора. */
export function CaseOption({ row, checked, onToggle }: { row: CaseRow; checked: boolean; onToggle: () => void }) {
  return (
    <label className="form__check">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span>
        №{row.number} «{row.title}»
      </span>
    </label>
  );
}
