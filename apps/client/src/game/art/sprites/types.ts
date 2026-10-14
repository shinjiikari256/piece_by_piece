import type { SpriteKey } from "../../../../../../shared/case";
import type { Ctx } from "../common";

export interface SpriteSpec {
  w: number; // ширина в базовых пикселях
  h: number;
  footprint: number; // ширина в тайлах
  solid: boolean;
  /** Лежит на полу (ковёр) — всегда рисуется под персонажами. */
  flat?: boolean;
  /** Висит на стене: на сколько базовых пикселей низ поднят над полом клетки. */
  mount?: number;
  draw: (ctx: Ctx) => void;
}

/** Группа предметов: так они подписаны в палитре редактора карты; файл группы — `sprites/<id>.ts`. */
export interface SpriteGroup {
  id: string;
  label: string;
  sprites: Partial<Record<SpriteKey, SpriteSpec>>;
}
