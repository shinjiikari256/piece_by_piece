/** Общее для процедурного pixel-art: масштаб, холст, примитивы. */
export const BASE_TILE = 16;
export const SCALE = 2;
export const TILE = BASE_TILE * SCALE;

export type Ctx = CanvasRenderingContext2D;

export const rect = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

/** Детерминированный шум, чтобы текстуры не «мигали» между запусками. */
export const noise = (x: number, y: number) => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
