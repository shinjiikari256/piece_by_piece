import { rect } from "../common";
import { outlineBox } from "./helpers";
import type { SpriteGroup } from "./types";

export const street: SpriteGroup = {
  id: "street",
  label: "Улица",
  sprites: {
    street_lamp: {
      w: 16, h: 36, footprint: 1, solid: true,
      draw(ctx) {
        // фонарь на столбе: основание, столб, кронштейн, плафон и свет
        rect(ctx, 5, 30, 6, 6, "#3d4650");
        rect(ctx, 7, 6, 2, 24, "#4a525c");
        rect(ctx, 7, 4, 7, 2, "#4a525c");
        outlineBox(ctx, 10, 6, 5, 3, "#f6d55c", "#6e5a1c");
        rect(ctx, 8, 9, 8, 6, "rgba(246,213,92,0.25)");
      },
    },
    tree: {
      w: 32, h: 40, footprint: 2, solid: true,
      draw(ctx) {
        // дерево: ствол и крона из нескольких слоёв
        rect(ctx, 14, 26, 4, 14, "#6e4824");
        rect(ctx, 13, 36, 6, 4, "#5c3d22");
        rect(ctx, 6, 8, 20, 18, "#3f8f4f");
        rect(ctx, 10, 2, 12, 8, "#3f8f4f");
        rect(ctx, 3, 14, 6, 10, "#3f8f4f");
        rect(ctx, 23, 14, 6, 10, "#3f8f4f");
        rect(ctx, 8, 20, 16, 5, "#2e6b3b");
        rect(ctx, 10, 6, 4, 3, "#6cc07c");
        rect(ctx, 18, 12, 5, 3, "#6cc07c");
      },
    },
    car: {
      w: 48, h: 24, footprint: 3, solid: true,
      draw(ctx) {
        // легковая машина, вид сбоку: кузов, салон со стёклами, колёса, фары
        outlineBox(ctx, 0, 10, 48, 10, "#2f5fa8", "#16294a");
        outlineBox(ctx, 10, 2, 28, 9, "#2f5fa8", "#16294a");
        rect(ctx, 12, 4, 10, 6, "#9fd3e8");
        rect(ctx, 24, 4, 12, 6, "#9fd3e8");
        rect(ctx, 22, 4, 2, 6, "#16294a");
        outlineBox(ctx, 6, 17, 10, 7, "#1d2229", "#0c0e11");
        outlineBox(ctx, 32, 17, 10, 7, "#1d2229", "#0c0e11");
        rect(ctx, 9, 19, 4, 3, "#8a8f96");
        rect(ctx, 35, 19, 4, 3, "#8a8f96");
        rect(ctx, 45, 12, 3, 3, "#f6d55c");
        rect(ctx, 0, 12, 2, 3, "#d63c3c");
      },
    },
    bus_stop: {
      w: 32, h: 34, footprint: 2, solid: true,
      draw(ctx) {
        // остановка: крыша, стойки, стекло, скамья и знак
        outlineBox(ctx, 0, 0, 32, 4, "#4a525c", "#1d2229");
        rect(ctx, 1, 4, 2, 28, "#4a525c");
        rect(ctx, 29, 4, 2, 28, "#4a525c");
        rect(ctx, 3, 5, 26, 18, "rgba(159,211,232,0.35)");
        rect(ctx, 24, 6, 4, 6, "#2f6fd6");
        rect(ctx, 5, 24, 22, 3, "#a8743f");
        rect(ctx, 6, 27, 2, 5, "#3b2f25");
        rect(ctx, 24, 27, 2, 5, "#3b2f25");
      },
    },
    mailbox: {
      w: 16, h: 22, footprint: 1, solid: true,
      draw(ctx) {
        // почтовый ящик на столбе с флажком
        outlineBox(ctx, 2, 2, 12, 10, "#2f5fa8", "#16294a");
        rect(ctx, 4, 6, 8, 1, "#0c0e11");
        rect(ctx, 7, 12, 2, 10, "#4a525c");
        rect(ctx, 11, 0, 2, 3, "#d63c3c");
      },
    },
  },
};
