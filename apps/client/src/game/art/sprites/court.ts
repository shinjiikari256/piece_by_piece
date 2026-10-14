import { rect } from "../common";
import { outlineBox } from "./helpers";
import type { SpriteGroup } from "./types";

export const court: SpriteGroup = {
  id: "court",
  label: "Суд и полиция",
  sprites: {
    judge_bench: {
      w: 32, h: 30, footprint: 2, solid: true,
      draw(ctx) {
        // высокая трибуна судьи: верхняя кромка, фасад с тремя панелями, табличка и молоток
        outlineBox(ctx, 0, 6, 32, 5, "#8f6a40", "#3b2a18");
        outlineBox(ctx, 1, 11, 30, 19, "#6b4a2b", "#3b2a18");
        for (const x of [3, 12, 21]) {
          rect(ctx, x, 14, 8, 13, "#5a3d22");
          rect(ctx, x + 1, 15, 6, 1, "#7a5632");
        }
        rect(ctx, 12, 7, 8, 2, "#d8b27a");
        rect(ctx, 24, 2, 5, 2, "#2b2b2b");
        rect(ctx, 26, 4, 1, 2, "#8f6a40");
      },
    },
    witness_stand: {
      w: 16, h: 22, footprint: 1, solid: true,
      draw(ctx) {
        // трибуна свидетеля с микрофоном
        rect(ctx, 7, 2, 2, 5, "#2b2b2b");
        rect(ctx, 6, 1, 4, 2, "#2b2b2b");
        outlineBox(ctx, 0, 7, 16, 3, "#a8743f", "#3b2a18");
        outlineBox(ctx, 1, 10, 14, 12, "#8a5c31", "#3b2a18");
        rect(ctx, 3, 13, 10, 7, "#6e4824");
      },
    },
    justice_statue: {
      w: 16, h: 30, footprint: 1, solid: true,
      draw(ctx) {
        // Фемида с весами на постаменте
        outlineBox(ctx, 2, 23, 12, 7, "#c9c4b8", "#6b665c");
        rect(ctx, 6, 11, 4, 12, "#e8e2d0");
        rect(ctx, 6, 7, 4, 4, "#d8cfb8");
        rect(ctx, 6, 8, 4, 1, "#6b665c");
        rect(ctx, 1, 10, 14, 1, "#b08a3c");
        rect(ctx, 1, 11, 1, 5, "#b08a3c");
        rect(ctx, 0, 16, 4, 1, "#b08a3c");
        rect(ctx, 14, 11, 1, 5, "#b08a3c");
        rect(ctx, 12, 16, 4, 1, "#b08a3c");
        rect(ctx, 7, 3, 2, 4, "#b08a3c");
      },
    },
    flag: {
      w: 16, h: 30, footprint: 1, solid: true,
      draw(ctx) {
        // флагшток на подставке и триколор
        outlineBox(ctx, 0, 26, 8, 4, "#555d66", "#2b2f36");
        rect(ctx, 3, 2, 2, 24, "#8a8f96");
        rect(ctx, 2, 0, 4, 2, "#d8b27a");
        rect(ctx, 5, 3, 10, 4, "#f4f1ea");
        rect(ctx, 5, 7, 10, 4, "#2f5fa8");
        rect(ctx, 5, 11, 10, 4, "#c0392b");
      },
    },
    holding_cell: {
      w: 32, h: 30, footprint: 2, solid: true,
      draw(ctx) {
        // решётка камеры: рамка и прутья, за ними видно пол
        rect(ctx, 0, 0, 32, 3, "#3d4650");
        rect(ctx, 0, 27, 32, 3, "#3d4650");
        for (const x of [1, 5, 9, 13, 17, 21, 25, 29]) rect(ctx, x, 3, 2, 24, "#7f8c99");
        rect(ctx, 13, 13, 6, 5, "#3d4650");
        rect(ctx, 15, 14, 2, 2, "#f6d55c");
      },
    },
  },
};
