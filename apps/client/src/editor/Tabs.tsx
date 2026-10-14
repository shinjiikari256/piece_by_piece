import "./Tabs.css";
import type { ReactNode } from "react";

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
  return (
    <div className={`tabs tabs--${variant}${className ? ` ${className}` : ""}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === active} className="tab" title={t.title} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
      {trailing}
    </div>
  );
}
