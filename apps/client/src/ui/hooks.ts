import { useEffect, useRef, type RefObject } from "react";

/**
 * Клавиша на window. Обработчик всегда актуальный — подписка не пересобирается при каждом рендере.
 * `capture` — раньше остальных обработчиков (окна, перехватывающие Esc/Enter); `enabled: false` — не слушаем.
 */
export function useWindowKey(handler: (e: KeyboardEvent) => void, { capture = false, enabled = true }: { capture?: boolean; enabled?: boolean } = {}) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => latest.current(e);
    window.addEventListener("keydown", onKey, capture);
    return () => window.removeEventListener("keydown", onKey, capture);
  }, [capture, enabled]);
}

/**
 * Esc для слоёв интерфейса (окно, подтверждение, выпадающий список): обрабатывает только верхний — тот, что смонтирован последним.
 * Остальные обработчики Esc (в том числе игровой в `App.tsx`) событие не получают.
 */
const escapeStack: { current: () => void }[] = [];
function onEscapeKey(e: KeyboardEvent) {
  const top = escapeStack.at(-1);
  if (e.key !== "Escape" || !top) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  top.current();
}
export function useEscape(onEscape: () => void, enabled = true) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => {
    if (!enabled) return;
    escapeStack.push(latest);
    if (escapeStack.length === 1) window.addEventListener("keydown", onEscapeKey, true);
    return () => {
      escapeStack.splice(escapeStack.indexOf(latest), 1);
      if (!escapeStack.length) window.removeEventListener("keydown", onEscapeKey, true);
    };
  }, [enabled]);
}

/**
 * Закрыть выпадающее по клику вне указанных элементов и (если `esc`) по Esc (через `useEscape`: закрывается только верхнее).
 */
export function useDismiss(open: boolean, onClose: () => void, inside: RefObject<HTMLElement | null>[], { esc = true }: { esc?: boolean } = {}) {
  const close = useRef(onClose);
  close.current = onClose;
  const insideRefs = useRef(inside);
  insideRefs.current = inside;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!insideRefs.current.some((r) => r.current?.contains(e.target as Node))) close.current();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  useEscape(() => close.current(), open && esc);
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Окно держит фокус: при открытии фокус уходит в окно, Tab и Shift+Tab ходят по кругу внутри, при закрытии фокус возвращается.
 * Без этого Tab уходил в страницу под подложкой. Корню окна нужен `tabIndex={-1}`.
 */
export function useFocusTrap(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      const first = items[0];
      const last = items.at(-1);
      const active = document.activeElement;
      if (!first || !last) e.preventDefault();
      else if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [root]);
}

/**
 * ↑ / ↓ переводят фокус по кругу между элементами `selector` внутри `root` (карточки, варианты ответа).
 * `active` — условие, при котором навигация включена (у вложенного списка с приоритетом внешний выключается). Не мешает полям ввода и выпадающим спискам; если фокус не на элементе, ↓ ставит его на первый, ↑ — на последний.
 */
export function useArrowNav(root: RefObject<HTMLElement | null>, selector: string, active: () => boolean = () => true) {
  useWindowKey((e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (!active()) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, [aria-haspopup], [role="listbox"]')) return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>(selector) ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[at === -1 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length].focus();
  });
}

const SCROLL_KEYS: Record<string, (height: number) => number> = {
  ArrowDown: () => 48,
  ArrowUp: () => -48,
  PageDown: (h) => h * 0.9,
  PageUp: (h) => -h * 0.9,
  Home: () => -Infinity,
  End: () => Infinity,
};

/**
 * Прокрутка окна клавишами ↑ ↓ PageUp PageDown Home End, когда фокус вне прокручиваемой области (на подложке или вкладках):
 * браузер там прокручивать нечего. Если фокус внутри области или стрелки уже заняты (навигация по карточкам), ничего не делаем.
 */
export function useScrollKeys(root: RefObject<HTMLElement | null>) {
  useWindowKey((e) => {
    const delta = SCROLL_KEYS[e.key];
    if (!delta || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [aria-haspopup], [role="listbox"]')) return;
    // первая (внешняя) прокручиваемая область окна, которой есть что прокручивать
    const scroller = [...(root.current?.querySelectorAll<HTMLElement>("*") ?? [])].find(
      (x) => x.scrollHeight > x.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(x).overflowY),
    );
    if (!scroller || scroller.contains(document.activeElement)) return; // внутри области браузер прокрутит сам
    // стрелки могут занять обработчики, подключённые позже, — решаем после всех
    setTimeout(() => {
      if (e.defaultPrevented) return;
      const by = delta(scroller.clientHeight);
      scroller.scrollTo({ top: Number.isFinite(by) ? scroller.scrollTop + by : by < 0 ? 0 : scroller.scrollHeight });
    });
  });
}
