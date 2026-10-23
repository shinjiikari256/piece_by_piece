import { readJson, writeJson } from "../state/storage";
import type { Dialogue, DialogueNode } from "../../../../shared/case";

export const NODE_W = 240;
const COL_GAP = 90;
const ROW_GAP = 24;

export type Pos = { x: number; y: number };
/** Положение карточек: диалог → реплика → позиция. */
export type Layout = Record<string, Record<string, Pos>>;

const layoutKey = (caseId: string) => `editor:layout:${caseId}`;
export const loadLayout = (caseId: string): Layout => readJson<Layout>(layoutKey(caseId), {});
export const saveLayout = (caseId: string, layout: Layout) => void writeJson(layoutKey(caseId), layout);

/** Оценка высоты карточки, пока она не отрисована. */
const estimateHeight = (n: DialogueNode) => 92 + n.choices.length * 27 + (n.effects.length ? 20 : 0);

/**
 * Раскладка по слоям: старт слева, дальше — по расстоянию от него.
 * В колонке карточки идут в порядке обхода и ставятся друг под друга по реальной высоте.
 */
export function autoLayout(d: Dialogue, heights: Record<string, number> = {}): Record<string, Pos> {
  const depth = new Map<string, number>([[d.startNodeId, 0]]);
  const order = [d.startNodeId];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const node = d.nodes.find((n) => n.id === id);
    for (const ch of node?.choices ?? []) {
      if (ch.next && !depth.has(ch.next)) {
        depth.set(ch.next, depth.get(id)! + 1);
        order.push(ch.next);
      }
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  const byOrder = [...d.nodes].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
  });
  const colY = new Map<number, number>();
  const out: Record<string, Pos> = {};
  for (const n of byOrder) {
    const col = depth.get(n.id) ?? maxDepth + 1; // недостижимые — в отдельной колонке справа
    const y = colY.get(col) ?? 20;
    out[n.id] = { x: 20 + col * (NODE_W + COL_GAP), y };
    colY.set(col, y + (heights[n.id] ?? estimateHeight(n)) + ROW_GAP);
  }
  return out;
}
