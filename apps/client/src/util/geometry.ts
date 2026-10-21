import { clamp } from "../../../../shared/math";

/** Клетка сетки `cols × rows` под указателем на холсте (координаты — в пределах сетки, даже если указатель вышел за холст). */
export function cellAt(canvas: HTMLElement, e: { clientX: number; clientY: number }, cols: number, rows: number): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return {
    x: clamp(Math.floor(((e.clientX - r.left) / r.width) * cols), 0, cols - 1),
    y: clamp(Math.floor(((e.clientY - r.top) / r.height) * rows), 0, rows - 1),
  };
}
