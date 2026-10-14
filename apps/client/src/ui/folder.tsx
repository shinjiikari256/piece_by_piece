import type { CSSProperties } from "react";
import { Icon, type IconName } from "./icons";

export interface FolderTab {
  id: string;
  label: string;
  icon?: IconName;
}

/**
 * Полоса закладок окна-папки — единая для всех папок (дело, результат, «Как играть», журнал, вход):
 * «назад» слева, закладки (активная поднята и сливается с листом), вкладка-крестик справа.
 * Закладка без `onTab` или единственная — просто название, оно всегда выглядит активным.
 */
export function FolderTabs({
  tabs,
  active,
  onTab,
  back,
  onClose,
  className = "",
}: {
  tabs: FolderTab[];
  active: string;
  onTab?: (id: string) => void;
  back?: { label: string; onClick: () => void };
  /** Вкладка-крестик справа. */
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div className={`folder__tabs ${className}`} role="tablist">
      {back && (
        <button className="folder__back" onClick={back.onClick}>
          ← {back.label}
        </button>
      )}
      {tabs.map((t, i) => {
        const cls = "folder__tab folder__tab--btn";
        const order = { "--tab-i": i } as CSSProperties; // порядок наложения: каждая закладка лежит над следующей
        const label = (
          <>
            {t.icon && <Icon name={t.icon} size={15} />} {t.label}
          </>
        );
        return onTab && tabs.length > 1 ? (
          <button key={t.id} role="tab" aria-selected={t.id === active} className={cls} style={order} onClick={() => onTab(t.id)}>
            {label}
          </button>
        ) : (
          <div key={t.id} role="tab" aria-selected={t.id === active} className={cls} style={order}>
            {label}
          </div>
        );
      })}
      {onClose && (
        <button className="folder__tab folder__tab--btn folder__close" onClick={onClose} aria-label="Закрыть (Esc)" title="Закрыть (Esc)">
          ✕
        </button>
      )}
    </div>
  );
}
