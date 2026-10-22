import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

const MOVE_PX = 6;
const HOLD_MS = 250;

/**
 * Перетаскивание карточек материалов в ячейки сопоставления (`[data-slot]`): мышь — после сдвига на несколько px,
 * касание — после короткого удержания (иначе это прокрутка списка). Вешается на контейнер карточек; карточку определяет
 * по `[data-mark-key]`. Обычный клик по карточке работает как раньше — после перетаскивания он гасится.
 */
export function useCardDrag(enabled: boolean, onDrop: (key: string, slot: number) => void) {
  const drop = useRef(onDrop);
  drop.current = onDrop;

  return useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
      const card = (e.target as Element).closest<HTMLElement>("[data-mark-key]");
      const key = card?.dataset.markKey;
      if (!card || !key) return;

      const touch = e.pointerType !== "mouse";
      const start = { x: e.clientX, y: e.clientY };
      let ghost: HTMLElement | null = null;
      let over: HTMLElement | null = null;
      let timer = 0;
      let dragging = false;

      const slotAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot]") ?? null;
      const begin = () => {
        dragging = true;
        const r = card.getBoundingClientRect();
        ghost = card.cloneNode(true) as HTMLElement;
        ghost.removeAttribute("data-mark-key");
        Object.assign(ghost.style, {
          position: "fixed",
          left: `${r.left}px`,
          top: `${r.top}px`,
          width: `${r.width}px`,
          margin: "0",
          pointerEvents: "none",
          zIndex: "1000",
          opacity: "0.9",
          boxShadow: "var(--elev-3)",
        });
        document.body.append(ghost);
      };
      const move = (ev: PointerEvent) => {
        if (!dragging) {
          if (touch) {
            // пальцем повёл раньше времени — это прокрутка
            if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > MOVE_PX) finish(false, ev);
            return;
          }
          if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < MOVE_PX) return;
          begin();
        }
        ghost!.style.transform = `translate(${ev.clientX - start.x}px, ${ev.clientY - start.y}px)`;
        const next = slotAt(ev.clientX, ev.clientY);
        if (next !== over) {
          over?.removeAttribute("data-over");
          next?.setAttribute("data-over", "");
          over = next;
        }
      };
      const block = (ev: TouchEvent) => dragging && ev.cancelable && ev.preventDefault();
      const swallowClick = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      function finish(commit: boolean, ev?: PointerEvent) {
        window.clearTimeout(timer);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("touchmove", block);
        over?.removeAttribute("data-over");
        ghost?.remove();
        if (!dragging) return;
        // клик после отпускания — не выбор карточки
        window.addEventListener("click", swallowClick, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", swallowClick, { capture: true }), 0);
        const slot = commit && ev ? slotAt(ev.clientX, ev.clientY) : null;
        if (slot) drop.current(key!, Number(slot.dataset.slot));
      }
      const up = (ev: PointerEvent) => finish(true, ev);
      const cancel = () => finish(false);

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("touchmove", block, { passive: false });
      if (touch) timer = window.setTimeout(begin, HOLD_MS);
    },
    [enabled],
  );
}
