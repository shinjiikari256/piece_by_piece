/** Значение в пределах [min, max]. */
export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
