import { rect } from "../common";
import { outlineBox } from "./helpers";
import type { SpriteGroup } from "./types";

export const household: SpriteGroup = {
  id: "household",
  label: "Быт и кухня",
  sprites: {
    fridge: {
      w: 16, h: 30, footprint: 1, solid: true,
      draw(ctx) {
        outlineBox(ctx, 1, 0, 14, 30, "#eef1f4", "#5c6670");
        rect(ctx, 2, 10, 12, 1, "#5c6670");
        rect(ctx, 11, 4, 1, 4, "#9aa5b1");
        rect(ctx, 11, 13, 1, 6, "#9aa5b1");
        rect(ctx, 4, 3, 3, 2, "#f6d55c");
        rect(ctx, 5, 14, 3, 3, "#d63c3c");
      },
    },
    stove: {
      w: 16, h: 20, footprint: 1, solid: true,
      draw(ctx) {
        outlineBox(ctx, 1, 2, 14, 18, "#e6e9ed", "#5c6670");
        rect(ctx, 3, 4, 4, 3, "#2b2b2b");
        rect(ctx, 9, 4, 4, 3, "#2b2b2b");
        outlineBox(ctx, 3, 10, 10, 7, "#2b2f36", "#5c6670");
        rect(ctx, 4, 0, 8, 3, "#9aa5b1");
      },
    },
    sink: {
      w: 16, h: 20, footprint: 1, solid: true,
      draw(ctx) {
        outlineBox(ctx, 1, 6, 14, 14, "#e6e9ed", "#5c6670");
        outlineBox(ctx, 3, 7, 10, 5, "#c9d1d9", "#7f8c99");
        rect(ctx, 7, 2, 2, 6, "#9aa5b1");
        rect(ctx, 7, 2, 4, 1, "#9aa5b1");
        rect(ctx, 4, 15, 8, 1, "#9aa5b1");
      },
    },
    kitchen_counter: {
      w: 32, h: 22, footprint: 2, solid: true,
      draw(ctx) {
        outlineBox(ctx, 0, 6, 32, 6, "#d9cdb8", "#6e5a40");
        outlineBox(ctx, 0, 11, 32, 11, "#b08a5a", "#6e5a40");
        rect(ctx, 15, 12, 1, 9, "#6e5a40");
        rect(ctx, 6, 15, 4, 1, "#e0c690");
        rect(ctx, 22, 15, 4, 1, "#e0c690");
        // микроволновка и чайник
        outlineBox(ctx, 3, 0, 12, 8, "#e6e9ed", "#5c6670");
        rect(ctx, 4, 1, 7, 6, "#2b2f36");
        rect(ctx, 12, 2, 2, 1, "#2ecc71");
        outlineBox(ctx, 22, 2, 6, 6, "#c0392b", "#5a1a14");
      },
    },
    trash_bin: {
      w: 16, h: 14, footprint: 1, solid: true,
      draw(ctx) {
        outlineBox(ctx, 3, 2, 10, 12, "#6f7c88", "#353d45");
        rect(ctx, 2, 2, 12, 2, "#353d45");
        rect(ctx, 5, 1, 4, 2, "#f7f4ec");
        rect(ctx, 5, 6, 1, 6, "#5d6974");
        rect(ctx, 8, 6, 1, 6, "#5d6974");
        rect(ctx, 11, 6, 1, 6, "#5d6974");
      },
    },
    boxes: {
      w: 32, h: 22, footprint: 2, solid: true,
      draw(ctx) {
        outlineBox(ctx, 0, 8, 15, 14, "#c49a6c", "#6e4824");
        outlineBox(ctx, 14, 11, 17, 11, "#b8894f", "#6e4824");
        outlineBox(ctx, 4, 0, 13, 9, "#d2a46d", "#6e4824");
        rect(ctx, 7, 8, 1, 14, "#e0c690");
        rect(ctx, 22, 11, 1, 11, "#e0c690");
        rect(ctx, 6, 3, 8, 2, "#f7f4ec");
        rect(ctx, 17, 15, 6, 3, "#f7f4ec");
      },
    },
    floor_lamp: {
      w: 16, h: 30, footprint: 1, solid: true,
      draw(ctx) {
        rect(ctx, 3, 0, 10, 7, "#f6d55c");
        rect(ctx, 4, 1, 8, 1, "#fff2b3");
        rect(ctx, 7, 7, 2, 20, "#3b2f25");
        rect(ctx, 4, 27, 8, 2, "#3b2f25");
      },
    },
    rug: {
      w: 32, h: 16, footprint: 2, solid: false, flat: true,
      draw(ctx) {
        outlineBox(ctx, 0, 2, 32, 13, "#a8433a", "#6e2a24");
        rect(ctx, 3, 5, 26, 7, "#c75a4f");
        rect(ctx, 6, 7, 20, 3, "#e0b23c");
        rect(ctx, 14, 6, 4, 5, "#a8433a");
      },
    },
    plant: {
      w: 16, h: 24, footprint: 1, solid: true,
      draw(ctx) {
        const leaves = "#3f8f4f";
        rect(ctx, 6, 2, 4, 6, leaves);
        rect(ctx, 2, 6, 5, 4, leaves);
        rect(ctx, 9, 5, 5, 5, leaves);
        rect(ctx, 4, 10, 8, 5, leaves);
        rect(ctx, 7, 3, 1, 3, "#6cc07c");
        rect(ctx, 3, 7, 2, 1, "#6cc07c");
        rect(ctx, 10, 6, 2, 1, "#6cc07c");
        rect(ctx, 6, 11, 3, 1, "#2e6b3b");
        outlineBox(ctx, 4, 15, 8, 8, "#c0643f", "#6e3420");
        rect(ctx, 5, 16, 6, 1, "#d98560");
      },
    },
    fire_extinguisher: {
      w: 16, h: 18, footprint: 1, solid: true,
      draw(ctx) {
        outlineBox(ctx, 5, 4, 6, 13, "#d63c3c", "#6e1a14");
        rect(ctx, 6, 5, 1, 9, "#ff8a80");
        rect(ctx, 6, 1, 4, 3, "#2b2b2b");
        rect(ctx, 10, 2, 3, 1, "#2b2b2b");
        rect(ctx, 6, 9, 4, 3, "#f7f4ec");
      },
    },
  },
};
