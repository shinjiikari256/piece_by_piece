import { useMemo } from "react";
import {
  BASE_TILE,
  CHAR_H,
  CHAR_W,
  DOOR_SIZE,
  SPRITES,
  TILE_NAMES,
  drawCharacter,
  drawSprite,
  drawDoor,
  type Look,
} from "../../game/art";


/** Клетки, которые занимает дверь: две по ширине или по высоте. */
export const doorTiles = (d: { x: number; y: number; orientation: "h" | "v" }) =>
  d.orientation === "h" ? [{ x: d.x, y: d.y }, { x: d.x + 1, y: d.y }] : [{ x: d.x, y: d.y }, { x: d.x, y: d.y + 1 }];

export const doorCache = new Map<string, HTMLCanvasElement>();
export function doorCanvas(orientation: "h" | "v", locked: boolean) {
  const key = `${orientation}:${locked}`;
  let c = doorCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = DOOR_SIZE[orientation].w;
    c.height = DOOR_SIZE[orientation].h;
    drawDoor(c.getContext("2d")!, orientation, false, locked);
    doorCache.set(key, c);
  }
  return c;
}

export const TILE_TOOLS = Object.entries(TILE_NAMES).map(([ch, label]) => ({ ch, label }));

export const T = BASE_TILE;

/** Персонажи: кэш картинок по внешности (она может быть своей у каждого). */
export const lookCache = new Map<string, HTMLCanvasElement>();
export function lookCanvas(look: Look) {
  const key = JSON.stringify(look);
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
  return useMemo(() => {
    const sprites = new Map<string, HTMLCanvasElement>();
    for (const [key, spec] of Object.entries(SPRITES)) {
      const c = document.createElement("canvas");
      c.width = spec.w;
      c.height = spec.h;
      drawSprite(c.getContext("2d")!, spec);
      sprites.set(key, c);
    }
    return { sprites };
  }, []);
}
