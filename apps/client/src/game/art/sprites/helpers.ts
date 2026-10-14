import { rect, type Ctx } from "../common";

/** Рамка с заливкой: контур цвета `line`, внутри `fill`. */
export const outlineBox = (ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, line = "#3b2f25") => {
  rect(ctx, x, y, w, h, line);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
};
