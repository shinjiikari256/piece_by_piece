import { rect, type Ctx } from "./common";

// ---------- Двери ----------

/** Размер текстуры двери в базовых пикселях. Персонаж — 24 px, дверь заметно выше него. */
export const DOOR_SIZE = { h: { w: 32, h: 32 }, v: { w: 16, h: 32 } } as const;

/**
 * Боковая дверь нарисована «лёжа»: притолока у внешней стороны, порог — к комнате.
 * В левой половине карты притолока слева, в правой — справа (текстуру отражаем).
 */
export const doorMirrored = (doorX: number, mapWidth: number) => doorX >= mapWidth / 2;

/**
 * Дверь на 2 клетки. h — в горизонтальной стене (вид спереди), v — в вертикальной
 * (видна торцом). locked рисует замок.
 */
export function drawDoor(ctx: Ctx, orientation: "h" | "v", open: boolean, locked = false) {
  const frame = "#5c3d22";
  const leaf = "#a8743f";
  const leafDark = "#8a5c31";
  if (orientation === "h") {
    const H = DOOR_SIZE.h.h;
    // коробка
    rect(ctx, 0, 0, 2, H, frame);
    rect(ctx, 30, 0, 2, H, frame);
    rect(ctx, 0, 0, 32, 3, frame);
    if (open) {
      // створки распахнуты внутрь — видны узкими полосами у косяков
      rect(ctx, 2, 3, 3, H - 5, leafDark);
      rect(ctx, 27, 3, 3, H - 5, leafDark);
      rect(ctx, 5, 3, 22, 1, "rgba(0,0,0,0.25)");
      return;
    }
    for (const x of [2, 16]) {
      rect(ctx, x, 3, 14, H - 3, "#3b2f25");
      rect(ctx, x + 1, 3, 12, H - 4, leaf);
      rect(ctx, x + 3, 6, 8, 9, leafDark);
      rect(ctx, x + 3, 18, 8, 10, leafDark);
    }
    rect(ctx, 13, 16, 2, 2, "#e0c690");
    rect(ctx, 17, 16, 2, 2, "#e0c690");
    if (locked) {
      rect(ctx, 14, 19, 4, 4, "#c9a227");
      rect(ctx, 15, 17, 2, 2, "#c9a227");
      rect(ctx, 15, 20, 2, 1, "#5c3d22");
    }
    return;
  }
  // вертикальная: та же двустворчатая дверь, повёрнутая набок; притолока слева, порог справа
  rect(ctx, 0, 0, 3, 32, frame); // притолока
  rect(ctx, 0, 0, 16, 2, frame); // косяки
  rect(ctx, 0, 30, 16, 2, frame);
  rect(ctx, 15, 2, 1, 28, "#3b2f25"); // порог
  if (open) {
    // створки распахнуты — видны узкими полосами у косяков
    rect(ctx, 3, 2, 11, 3, leafDark);
    rect(ctx, 3, 27, 11, 3, leafDark);
    rect(ctx, 3, 5, 1, 22, "rgba(0,0,0,0.25)");
    return;
  }
  for (const y of [2, 16]) {
    rect(ctx, 3, y, 12, 14, "#3b2f25");
    rect(ctx, 3, y + 1, 12, 12, leaf);
    rect(ctx, 5, y + 3, 4, 8, leafDark);
    rect(ctx, 10, y + 3, 4, 8, leafDark);
  }
  rect(ctx, 9, 13, 2, 2, "#e0c690");
  rect(ctx, 9, 17, 2, 2, "#e0c690");
  if (locked) {
    rect(ctx, 6, 14, 4, 4, "#c9a227");
    rect(ctx, 10, 15, 2, 2, "#c9a227");
    rect(ctx, 7, 15, 1, 2, "#5c3d22");
  }
}
