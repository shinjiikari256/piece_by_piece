import type { Ctx } from "../common";
import type { Footprint } from "./cells";

/** Цвет операции: `#rrggbb` или с прозрачностью `#rrggbbaa`. */
export const SPRITE_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

/**
 * Одна операция рисования; порядок в кадре = порядок рисования.
 * Заливка прямоугольника: (x, y, ширина, высота, цвет); ластик (без цвета) делает область прозрачной.
 */
export type SpriteOp = [x: number, y: number, w: number, h: number, color: string] | [x: number, y: number, w: number, h: number];

/** Кадры спрайта: именованные списки операций; кадр по умолчанию — `default`. */
export type SpriteFrames = { default: SpriteOp[] } & Record<string, SpriteOp[]>;

export interface SpriteSpec {
  w: number; // ширина в базовых пикселях
  h: number;
  /** Опора в тайлах: ширина вправо и высота вверх от точки предмета (нижний левый угол). */
  footprint: Footprint;
  solid: boolean;
  /** Лежит на полу (ковёр) — всегда рисуется под персонажами. */
  flat?: boolean;
  /** Висит на стене: на сколько базовых пикселей низ поднят над полом клетки. */
  mount?: number;
  /** Распахивается (кадр xdg-open - opens a file or URL in the user's preferred application

Synopsis

xdg-open { file | URL }

xdg-open { --help | --manual | --version }

Use 'man xdg-open' or 'xdg-open --manual' for additional info.), когда рядом игрок или сопровождающий, если предмет в этот момент проходим. */
  opensNear?: boolean;
  /** В правой половине карты рисуется зеркально (боковая дверь: притолока всегда у внешней стены). */
  mirrorRight?: boolean;
  frames: SpriteFrames;
}

/** Группа предметов: так они подписаны в палитре редактора карты; данные группы — `sprites/data/<id>.json`. */
export interface SpriteGroup {
  id: string;
  label: string;
  sprites: Record<string, SpriteSpec>;
}

/** Нарисовать кадр спрайта (по умолчанию `default`) в левый верхний угол холста. */
export function drawSprite(ctx: Ctx, spec: SpriteSpec, frame = "default") {
  for (const [x, y, w, h, color] of spec.frames[frame] ?? spec.frames.default) {
    if (color === undefined) {
      ctx.clearRect(x, y, w, h);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }
  }
}
