import { rect } from "../common";
import { outlineBox } from "./helpers";
import type { SpriteGroup } from "./types";

export const commerce: SpriteGroup = {
  id: "commerce",
  label: "Магазин и кафе",
  sprites: {
    shop_shelf: {
      w: 32, h: 28, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        // стеллаж с товаром на трёх полках
        outlineBox(ctx, 0, 0, 32, 28, "#7f8c99", "#3d4650");
        rect(ctx, 1, 9, 30, 1, "#3d4650");
        rect(ctx, 1, 18, 30, 1, "#3d4650");
        rect(ctx, 3, 4, 4, 5, "#c0392b");
        rect(ctx, 9, 5, 4, 4, "#f6d55c");
        rect(ctx, 15, 3, 5, 6, "#2f6fd6");
        rect(ctx, 22, 4, 4, 5, "#2e9e5b");
        rect(ctx, 27, 5, 3, 4, "#e07a9b");
        rect(ctx, 3, 13, 5, 5, "#e07a9b");
        rect(ctx, 10, 12, 4, 6, "#2e9e5b");
        rect(ctx, 16, 14, 6, 4, "#f6d55c");
        rect(ctx, 24, 12, 5, 6, "#2f6fd6");
        rect(ctx, 3, 22, 6, 5, "#2f6fd6");
        rect(ctx, 11, 23, 4, 4, "#c0392b");
        rect(ctx, 17, 21, 5, 6, "#f6d55c");
        rect(ctx, 24, 22, 5, 5, "#2e9e5b");
      },
    },
    cash_register: {
      w: 32, h: 22, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        // прилавок с кассовым аппаратом и корзинкой
        outlineBox(ctx, 0, 10, 32, 12, "#8a5c31", "#3b2a18");
        rect(ctx, 1, 10, 30, 2, "#b07a44");
        outlineBox(ctx, 18, 2, 10, 9, "#cfd6dd", "#4a525c");
        rect(ctx, 20, 3, 6, 3, "#8fd0b0");
        rect(ctx, 20, 7, 6, 1, "#4a525c");
        outlineBox(ctx, 3, 6, 9, 5, "#d98560", "#6e3420");
        rect(ctx, 5, 4, 3, 3, "#f6d55c");
      },
    },
    bar_counter: {
      w: 32, h: 24, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        // барная стойка с бутылками и стаканами
        outlineBox(ctx, 0, 6, 32, 5, "#5c3d22", "#2b1c10");
        rect(ctx, 1, 7, 30, 1, "#8f6a40");
        outlineBox(ctx, 1, 11, 30, 13, "#3f2b1b", "#2b1c10");
        rect(ctx, 4, 16, 24, 1, "#d8b27a");
        rect(ctx, 4, 1, 3, 5, "#2e9e5b");
        rect(ctx, 5, 0, 1, 1, "#2e9e5b");
        rect(ctx, 12, 3, 2, 3, "#cfe8f2");
        rect(ctx, 16, 3, 2, 3, "#cfe8f2");
        rect(ctx, 22, 1, 3, 5, "#8a4b1c");
        rect(ctx, 27, 2, 3, 4, "#2f6fd6");
      },
    },
    cafe_table: {
      w: 32, h: 22, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        // столик с чашкой и два стула по бокам
        outlineBox(ctx, 1, 10, 6, 8, "#c0643f", "#6e3420");
        outlineBox(ctx, 25, 10, 6, 8, "#c0643f", "#6e3420");
        outlineBox(ctx, 8, 8, 16, 4, "#e8e2d0", "#8a8574");
        rect(ctx, 15, 12, 2, 8, "#8a8574");
        rect(ctx, 11, 20, 10, 2, "#8a8574");
        rect(ctx, 14, 5, 3, 3, "#f7f4ec");
        rect(ctx, 14, 5, 3, 1, "#8a4b1c");
      },
    },
    atm: {
      w: 16, h: 28, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        // банкомат: экран, клавиатура, щель выдачи
        outlineBox(ctx, 1, 0, 14, 28, "#4a525c", "#1d2229");
        rect(ctx, 3, 1, 10, 1, "#2f6fd6");
        outlineBox(ctx, 3, 3, 10, 8, "#8fd0b0", "#1d2229");
        rect(ctx, 3, 13, 10, 6, "#2b2f36");
        rect(ctx, 4, 14, 2, 1, "#9aa5b1");
        rect(ctx, 7, 14, 2, 1, "#9aa5b1");
        rect(ctx, 10, 14, 2, 1, "#9aa5b1");
        rect(ctx, 4, 17, 8, 1, "#9aa5b1");
        rect(ctx, 4, 21, 8, 2, "#111418");
        rect(ctx, 5, 24, 6, 2, "#e8e2d0");
      },
    },
  },
};
