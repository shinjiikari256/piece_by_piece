export interface Footprint {
  w: number;
  h: number;
}

/** Клетки, занятые предметом. Точка предмета (x, y) — нижний левый угол опоры: ширина вправо, высота вверх. */
export function footprintCells(x: number, y: number, fp: Footprint): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let dy = 0; dy < fp.h; dy++) for (let dx = 0; dx < fp.w; dx++) cells.push({ x: x + dx, y: y - dy });
  return cells;
}

/** Попадает ли клетка в опору предмета. */
export function footprintHas(x: number, y: number, fp: Footprint, cx: number, cy: number): boolean {
  return cx >= x && cx < x + fp.w && cy <= y && cy > y - fp.h;
}

/** Клетки опоры, мешающие ходить: `solid` — значение для всех клеток, `cells` переопределяет отдельные. */
export function solidCells(
  x: number,
  y: number,
  spec: { footprint: Footprint; solid: boolean; cells?: { dx: number; dy: number; solid: boolean }[] },
  solid: boolean = spec.solid,
): { x: number; y: number }[] {
  const over = new Map((spec.cells ?? []).map((c) => [`${c.dx},${c.dy}`, c.solid]));
  return footprintCells(x, y, spec.footprint).filter((c) => over.get(`${c.x - x},${y - c.y}`) ?? solid);
}
