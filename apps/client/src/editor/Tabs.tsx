import "./Tabs.css";
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
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  variant = "inline",
  trailing,
  className,
}: {
  tabs: readonly TabItem<T>[];
  active: T | null;
  onChange: (id: T) => void;
  variant?: "bar" | "inline";
  trailing?: ReactNode;
  className?: string;
}) {
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
    <div className={`tabs tabs--${variant}${className ? ` ${className}` : ""}`} role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === active} className="tab" title={t.title} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
      {trailing}
    </div>
  );
}
