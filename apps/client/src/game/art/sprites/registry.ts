import type { CustomSprite } from "../../../../../../shared/case";
import { SPRITES } from "./index";
import { SPRITE_NAMES } from "../tiles";
import type { SpriteSpec } from "./types";

/** Ключи спрайтов дела, добавленные в `SPRITES` сейчас. */
let custom: string[] = [];
let version = 0;
let lastJson = "[]";

/** Меняется при каждой замене набора спрайтов дела: по нему сбрасывают кэши текстур. */
export const spriteVersion = () => version;

export const specOf = (s: CustomSprite): SpriteSpec => {
  const { key: _k, name: _n, group: _g, ...rest } = s;
  return rest as unknown as SpriteSpec;
};

/**
 * Подключить спрайты текущего дела к общим таблицам `SPRITES`/`SPRITE_NAMES` (прежние спрайты дела убираются).
 * Встроенные ключи затереть нельзя. Без изменений набора версия не растёт.
 */
export function registerCaseSprites(list: CustomSprite[] | undefined) {
  const json = JSON.stringify(list ?? []);
  if (json === lastJson) return;
  lastJson = json;
  for (const k of custom) {
    delete (SPRITES as Record<string, SpriteSpec>)[k];
    delete SPRITE_NAMES[k];
  }
  custom = [];
  for (const s of list ?? []) {
    if (s.key in SPRITES) continue;
    (SPRITES as Record<string, SpriteSpec>)[s.key] = specOf(s);
    SPRITE_NAMES[s.key] = s.name;
    custom.push(s.key);
  }
  version++;
}
