import "./Tabs.css";
import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  title?: string;
}

/**
 * Вкладки конструктора: закладки, активная поднята и сливается с листом под ней.
 * `bar` — полоса во всю ширину на фоне (локации карты, разделы с вкладками); `inline` — внутри панели с линией снизу.
 * `trailing` — что стоит после вкладок (кнопка «+ локация»; ей дают классы `tab tab--add`).
 * `onReorder(from, to)` — вкладки можно перетаскивать: `from` ставят на место `to`.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  variant = "inline",
  trailing,
  className,
  onReorder,
}: {
  tabs: readonly TabItem<T>[];
  active: T | null;
  onChange: (id: T) => void;
  variant?: "bar" | "inline";
  trailing?: ReactNode;
  className?: string;
  onReorder?: (from: T, to: T) => void;
}) {
  const [dragged, setDragged] = useState<T | null>(null);
  const [over, setOver] = useState<T | null>(null);
  // ← / → / Home / End на вкладке: перейти к соседней (фокус и выбор вместе)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !(e.target instanceof HTMLElement) || e.target.getAttribute("role") !== "tab") return;
    const at = tabs.findIndex((t) => t.id === active);
    const next = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next === null || !tabs[next]) return;
    e.preventDefault();
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
    onChange(tabs[next].id);
  };
  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- фокус у вкладок внутри, стрелки обрабатывает контейнер
    <div className={`tabs tabs--${variant}${className ? ` ${className}` : ""}`} role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className="tab"
          title={t.title}
          data-drop={over === t.id && dragged !== t.id ? "" : undefined}
          draggable={!!onReorder}
          onDragStart={onReorder ? (e) => ((e.dataTransfer.effectAllowed = "move"), setDragged(t.id)) : undefined}
          onDragOver={onReorder && dragged ? (e) => (e.preventDefault(), setOver(t.id)) : undefined}
          onDrop={onReorder ? (e) => (e.preventDefault(), dragged && dragged !== t.id && onReorder(dragged, t.id), setDragged(null), setOver(null)) : undefined}
          onDragEnd={onReorder ? () => (setDragged(null), setOver(null)) : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
      {trailing}
    </div>
  );
}
