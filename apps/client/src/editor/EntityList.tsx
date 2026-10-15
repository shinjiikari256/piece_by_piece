import { useRef, type ReactNode } from "react";
import { Icon } from "../ui/icons";
import { useArrowNav } from "../ui/hooks";

/** Название и ключ (id) пункта списка в две строки; `warn` — название выделено как проблемное. */
export function ItemText({ title, id, warn }: { title: ReactNode; id?: string; warn?: boolean }) {
  return (
    <span className="ed__item-text">
      <span className={`ed__item-title ellipsis ${warn ? "is-warn" : ""}`}>{title}</span>
      {id && <code className="ed__item-id">{id}</code>}
    </span>
  );
}

/**
 * Боковой список раздела конструктора: кнопка «Добавить», пункты, пустое состояние, подпись внизу.
 * Что внутри пункта — решает `renderItem` (обычно `ItemText`, перед ним — картинка `ed__item-art`);
 * `tools` — кнопки справа, видны при наведении (копия, удаление).
 */
export function EntityList<T>({
  items,
  getKey,
  isActive,
  onSelect,
  renderItem,
  tools,
  onAdd,
  addLabel = "Добавить",
  empty,
  note,
}: {
  items: readonly T[];
  getKey: (item: T, index: number) => string | number;
  isActive: (item: T, index: number) => boolean;
  onSelect: (item: T, index: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  tools?: (item: T, index: number) => ReactNode;
  onAdd: () => void;
  addLabel?: string;
  empty?: string;
  note?: ReactNode;
}) {
  // ↑ / ↓ ходят по пунктам, когда фокус уже в списке (Enter выбирает)
  const root = useRef<HTMLDivElement>(null);
  useArrowNav(root, ".ed__item", { within: true });
  return (
    <div className="ed__list" ref={root}>
      <button className="ed__list-add" onClick={onAdd}>
        <Icon name="plus" size={15} /> {addLabel}
      </button>
      <ul>
        {items.map((item, i) => (
          <li key={getKey(item, i)} className="ed__row" data-list-index={i}>
            <button className="ed__item row" aria-current={isActive(item, i) || undefined} onClick={() => onSelect(item, i)}>
              {renderItem(item, i)}
            </button>
            {tools && <span className="ed__row-tools">{tools(item, i)}</span>}
          </li>
        ))}
      </ul>
      {empty && !items.length && <p className="muted ed__list-empty">{empty}</p>}
      {note && <p className="muted ed__list-note">{note}</p>}
    </div>
  );
}
