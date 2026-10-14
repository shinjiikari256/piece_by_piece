import { rect } from "../common";
import { outlineBox } from "./helpers";
import type { SpriteGroup } from "./types";

export const wall: SpriteGroup = {
  id: "wall",
  label: "Настенное",
  sprites: {
    board: {
      w: 32, h: 11, footprint: 2, solid: false, mount: 5,
      draw(ctx) {
        outlineBox(ctx, 2, 0, 28, 10, "#c49a6c", "#5e4128");
        for (let i = 0; i < 30; i++) rect(ctx, 4 + ((i * 7) % 24), 2 + ((i * 5) % 6), 1, 1, "#b0855a");
        rect(ctx, 5, 2, 6, 6, "#f7f4ec");
        rect(ctx, 6, 3, 4, 1, "#9aa5b1");
        rect(ctx, 6, 5, 3, 1, "#9aa5b1");
        rect(ctx, 7, 2, 1, 1, "#d63c3c");
        rect(ctx, 13, 2, 5, 5, "#f6d55c");
        rect(ctx, 15, 2, 1, 1, "#2f6fd6");
        rect(ctx, 20, 1, 7, 8, "#ffffff");
        rect(ctx, 21, 3, 5, 1, "#2b3a55");
        rect(ctx, 21, 5, 5, 1, "#9aa5b1");
        rect(ctx, 23, 1, 1, 1, "#2e9e5b");
        rect(ctx, 3, 10, 26, 1, "rgba(0,0,0,0.18)");
      },
    },
    clock: {
      w: 16, h: 9, footprint: 1, solid: false, mount: 6,
      draw(ctx) {
        rect(ctx, 6, 0, 4, 9, "#3b2f25");
        rect(ctx, 4, 2, 8, 5, "#3b2f25");
        rect(ctx, 5, 1, 6, 7, "#3b2f25");
        rect(ctx, 6, 1, 4, 7, "#f7f4ec");
        rect(ctx, 5, 2, 6, 5, "#f7f4ec");
        rect(ctx, 8, 2, 1, 3, "#2b2b2b");
        rect(ctx, 8, 4, 2, 1, "#2b2b2b");
        rect(ctx, 6, 8, 4, 1, "rgba(0,0,0,0.15)");
      },
    },
    poster: {
      w: 16, h: 11, footprint: 1, solid: false, mount: 4,
      draw(ctx) {
        outlineBox(ctx, 4, 0, 8, 11, "#fdf8ec", "#9aa5b1");
        rect(ctx, 5, 1, 6, 4, "#2f6fd6");
        rect(ctx, 7, 2, 2, 2, "#f6d55c");
        rect(ctx, 5, 6, 6, 1, "#2b3a55");
        rect(ctx, 5, 8, 4, 1, "#9aa5b1");
        rect(ctx, 7, 0, 2, 1, "#d63c3c");
      },
    },
    whiteboard: {
      w: 32, h: 11, footprint: 2, solid: false, mount: 5,
      draw(ctx) {
        outlineBox(ctx, 2, 0, 28, 9, "#fbfbfb", "#9aa5b1");
        rect(ctx, 5, 2, 10, 1, "#2f6fd6");
        rect(ctx, 5, 4, 7, 1, "#2f6fd6");
        rect(ctx, 18, 2, 8, 5, "#ffffff");
        rect(ctx, 19, 3, 2, 2, "#d63c3c");
        rect(ctx, 22, 5, 3, 1, "#d63c3c");
        rect(ctx, 3, 9, 26, 2, "#9aa5b1");
        rect(ctx, 7, 8, 3, 1, "#2b2b2b");
      },
    },
    air_conditioner: {
      w: 32, h: 8, footprint: 2, solid: false, mount: 8,
      draw(ctx) {
        outlineBox(ctx, 4, 0, 24, 7, "#f4f6f8", "#9aa5b1");
        rect(ctx, 6, 4, 20, 1, "#c9d1d9");
        rect(ctx, 6, 5, 20, 1, "#dfe5ea");
        rect(ctx, 24, 1, 2, 1, "#2ecc71");
        rect(ctx, 6, 7, 20, 1, "rgba(0,0,0,0.12)");
      },
    },
    window: {
      w: 16, h: 16, footprint: 1, solid: false,
      draw(ctx) {
        rect(ctx, 1, 1, 14, 12, "#f4f1ea");
        rect(ctx, 2, 2, 12, 10, "#9fd3e8");
      },
    },
    door: {
      w: 16, h: 16, footprint: 1, solid: false,
      draw(ctx) {
        // дверная коробка и открытая створка
        rect(ctx, 0, 0, 2, 16, "#6b4a2b");
        rect(ctx, 14, 0, 2, 16, "#6b4a2b");
        rect(ctx, 0, 0, 16, 2, "#6b4a2b");
        rect(ctx, 14, 2, 2, 12, "#8f6a40");
        // табличка
        rect(ctx, 3, 3, 10, 4, "#2b3a55");
        rect(ctx, 4, 4, 8, 2, "#e8eef5");
        rect(ctx, 5, 5, 6, 1, "#2b3a55");
      },
    },
  },
};
