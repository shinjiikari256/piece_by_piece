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
 * Закрыть выпадающее по клику вне указанных элементов и (если `esc`) по Esc.
 * Esc перехватывается первым и дальше не идёт: закрывается только верхнее.
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
  useWindowKey(
    (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      close.current();
    },
    { capture: true, enabled: open && esc },
  );
}
