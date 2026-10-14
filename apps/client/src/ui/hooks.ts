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
