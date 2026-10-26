import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "../lib/hooks";

/**
 * Свой выпадающий список вместо нативного <select>: нативный не раскрывается
 * во встроенных браузерах (VS Code Simple Browser, часть WebView) и капризничает
 * в Firefox внутри <label>. Плюс здесь есть поиск по длинным спискам.
 * `variant="filter"` — компактный фильтр «Вид: все ▾» (журнал): подпись, картинка текущего пункта, подсветка при выбранном значении.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Картинка слева от подписи (портрет персонажа). */
  art?: ReactNode;
}

const SEARCH_FROM = 8;
/** Отступ списка от края окна браузера. */
const EDGE = 8;

export function Select({
  value,
  options,
  onChange,
  placeholder = "— выберите —",
  className = "",
  title,
  variant = "field",
  label,
  highlight = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  title?: string;
  variant?: "field" | "filter";
  /** Подпись перед значением (у фильтра: «Вид»). */
  label?: string;
  /** Подсветить кнопку: у фильтра — выбрано не «все». */
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options;

  const close = () => {
    setOpen(false);
    setQuery("");
    button.current?.focus();
  };
  const pick = (o: SelectOption | undefined) => {
    if (!o) return;
    onChange(o.value);
    close();
  };

  useLayoutEffect(() => {
    if (open && button.current) setRect(button.current.getBoundingClientRect());
    if (!open) setLeft(null);
  }, [open]);

  // список не должен вылезать за правый край окна: сдвигаем влево по его реальной ширине
  useLayoutEffect(() => {
    if (!open || !rect || !popup.current) return;
    const width = popup.current.offsetWidth;
    setLeft(Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE)));
  }, [open, rect, query, shown.length]);

  useEffect(() => {
    if (!open) return;
    setActive(
      Math.max(
        0,
        shown.findIndex((o) => o.value === value),
      ),
    );
    const onScroll = (e: Event) => {
      if (!popup.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- подписки ставятся на открытие; value/shown/close читаем из рендера открытия

  // клик вне кнопки и списка и Esc закрывают (Esc — верхний слой, см. useEscape)
  useDismiss(open, close, [popup, button]);

  useEffect(() => {
    popup.current?.querySelector(".sel__opt.is-active")?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(shown[active]);
    }
  };

  // список открывается вниз, а если места мало — вверх
  const below = rect ? window.innerHeight - rect.bottom : 0;
  const up = rect ? below < 260 && rect.top > below : false;
  const style = rect
    ? {
        left: left ?? rect.left,
        minWidth: Math.min(rect.width, window.innerWidth - 2 * EDGE),
        maxWidth: Math.min(Math.max(rect.width, 420), window.innerWidth - 2 * EDGE),
        ...(up ? { bottom: window.innerHeight - rect.top + 2 } : { top: rect.bottom + 2 }),
        maxHeight: Math.min(320, (up ? rect.top : below) - 12),
      }
    : undefined;

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`sel ${variant === "filter" ? "sel--filter" : ""} ${current ? "" : "is-empty"} ${highlight ? "is-set" : ""} ${className}`}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onKey}
        title={title ?? current?.label}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label && <span className="sel__label">{label}:</span>}
        {variant === "filter" && current?.art && <span className="sel__art">{current.art}</span>}
        <span className="sel__value">{current?.label ?? (value ? `⚠ ${value}` : placeholder)}</span>
        <span className="sel__arrow">▾</span>
      </button>
      {open &&
        rect &&
        createPortal(
          // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- фокус остаётся в кнопке/поле поиска, варианты выбираются стрелками
          <div ref={popup} className="sel__popup" style={style} role="listbox" onKeyDown={onKey}>
            {options.length >= SEARCH_FROM && (
              <input
                className="sel__search"
                autoFocus
                placeholder="Поиск…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
              />
            )}
            <div className="sel__list">
              {shown.length === 0 && <div className="sel__empty">Ничего не найдено</div>}
              {shown.map((o, i) => (
                // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- фокус остаётся в кнопке/поле поиска, варианты выбираются стрелками (aria-activedescendant-схема)
                <div
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  className={`sel__opt ${i === active ? "is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                >
                  {o.art && <span className="sel__art">{o.art}</span>}
                  {o.label}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
