/**
 * Процедурный pixel-art: всё рисуется прямоугольниками на canvas
 * в базовом разрешении (тайл 16 px) и масштабируется ×2 без сглаживания.
 * Единая палитра и пропорции держат стиль однородным.
 */
export * from "./common";
export * from "./tiles";
export * from "./sprites";
export * from "./characters";
export * from "./characters/parts";
export { registerCaseParts, partSpecOf } from "./characters/registry";
import { registerCaseSprites } from "./sprites";
import { registerCaseParts } from "./characters/registry";

/** Подключить весь рисованный контент дела: спрайты предметов и части персонажей. */
export function registerCaseArt(c: { sprites?: Parameters<typeof registerCaseSprites>[0]; parts?: Parameters<typeof registerCaseParts>[0] }) {
  registerCaseSprites(c.sprites);
  registerCaseParts(c.parts);
}
