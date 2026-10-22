import type { CSSProperties } from "react";
import { Icon, type IconName } from "./icons";
import { useTabKeys } from "./hooks";

export interface FolderTab {
  id: string;
  label: string;
  icon?: IconName;
  /** Непросмотренное: у закладки появляется точка. */
  isNew?: boolean;
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
  useTabKeys(tabs, active, onTab);
  const index = tabs.findIndex((t) => t.id === active);
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
            {t.isNew && <span className="folder__new" role="img" aria-label="новое" title="Новое" />}
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
      {onTab && tabs.length > 1 && (
        <div className="folder__step">
          <button className="btn btn--icon btn--sm" aria-label="Предыдущий раздел" disabled={index <= 0} onClick={() => onTab(tabs[index - 1].id)}>
            ‹
          </button>
          <span className="folder__step-name ellipsis">
            {tabs[index]?.label}
            <small>
              {" "}
              {index + 1} из {tabs.length}
            </small>
          </span>
          <button className="btn btn--icon btn--sm" aria-label="Следующий раздел" disabled={index >= tabs.length - 1} onClick={() => onTab(tabs[index + 1].id)}>
            ›
          </button>
        </div>
      )}
      {onClose && (
        <button className="folder__tab folder__tab--btn folder__close" onClick={onClose} aria-label="Закрыть (Esc)" title="Закрыть (Esc)">
          ✕
        </button>
      )}
    </div>
  );
}
