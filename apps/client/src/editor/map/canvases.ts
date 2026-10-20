import { useMemo } from "react";
import {
  BASE_TILE,
  CHAR_H,
  CHAR_W,
  SPRITES,
  TILE_NAMES,
  drawCharacter,
  drawSprite,
  spriteVersion,
  type Look,
} from "../../game/art";


/** Клетки палитры по легенде текущего дела (тайлы дела подключаются при правке). */
export const tileTools = () => Object.entries(TILE_NAMES).map(([ch, label]) => ({ ch, label }));

export const T = BASE_TILE;

/** Персонажи: кэш картинок по внешности (она может быть своей у каждого). */
export const lookCache = new Map<string, HTMLCanvasElement>();
export function lookCanvas(look: Look) {
  const key = `${spriteVersion()}|${JSON.stringify(look)}`; // части персонажей дела меняются вместе с версией рисунков
  let c = lookCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = CHAR_W;
    c.height = CHAR_H;
    drawCharacter(c.getContext("2d")!, look, "idle", 0);
    lookCache.set(key, c);
  }
  return c;
}

/** Картинки спрайтов рисуем один раз. */
export function useSpriteCanvases() {
  const version = spriteVersion();
  return useMemo(() => {
    void version; // набор спрайтов дела сменился — перерисовать
    const sprites = new Map<string, HTMLCanvasElement>();
    for (const [key, spec] of Object.entries(SPRITES)) {
      const c = document.createElement("canvas");
      c.width = spec.w;
      c.height = spec.h;
      drawSprite(c.getContext("2d")!, spec);
      sprites.set(key, c);
    }
    return { sprites };
  }, [version]);
}
