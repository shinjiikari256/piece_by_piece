import { rect } from "../common";
import { outlineBox } from "./helpers";
import type { SpriteGroup } from "./types";

export const medical: SpriteGroup = {
  id: "medical",
  label: "Больница",
  sprites: {
    hospital_bed: {
      w: 32, h: 18, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        // койка: изголовье слева, подушка, одеяло с крестом
        outlineBox(ctx, 0, 4, 32, 12, "#cfd6dd", "#4a525c");
        rect(ctx, 0, 0, 2, 14, "#8a8f96");
        rect(ctx, 2, 6, 28, 8, "#f4f1ea");
        rect(ctx, 3, 6, 8, 4, "#ffffff");
        rect(ctx, 12, 7, 17, 7, "#9fd3e8");
        rect(ctx, 21, 8, 1, 3, "#d63c3c");
        rect(ctx, 20, 9, 3, 1, "#d63c3c");
        rect(ctx, 1, 16, 2, 2, "#2b2f36");
        rect(ctx, 29, 16, 2, 2, "#2b2f36");
      },
    },
    iv_stand: {
      w: 16, h: 30, footprint: { w: 1, h: 1 }, solid: false,
      draw(ctx) {
        // стойка капельницы с пакетом и трубкой
        rect(ctx, 3, 2, 10, 1, "#cfd6dd");
        rect(ctx, 7, 2, 2, 26, "#cfd6dd");
        outlineBox(ctx, 9, 4, 5, 8, "#cfe8f2", "#4a525c");
        rect(ctx, 10, 7, 3, 4, "#9fd3e8");
        rect(ctx, 11, 12, 1, 10, "#cfe8f2");
        rect(ctx, 3, 28, 10, 2, "#4a525c");
      },
    },
  },
};
