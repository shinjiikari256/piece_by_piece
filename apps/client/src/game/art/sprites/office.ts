import { rect } from "../common";
import { outlineBox } from "./helpers";
import type { SpriteGroup } from "./types";

export const office: SpriteGroup = {
  id: "office",
  label: "Офис и техника",
  sprites: {
    printer: {
      w: 16, h: 14, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 1, 3, 14, 10, "#d9dde2", "#4a525c");
        rect(ctx, 3, 1, 10, 3, "#f7f4ec");
        rect(ctx, 3, 9, 10, 2, "#4a525c");
        rect(ctx, 11, 5, 2, 1, "#2e9e5b");
      },
    },
    server_rack: {
      w: 16, h: 30, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 1, 0, 14, 30, "#2b2f36", "#111418");
        for (let y = 2; y < 27; y += 4) {
          rect(ctx, 3, y, 10, 3, "#3d434c");
          rect(ctx, 4, y + 1, 1, 1, y % 8 === 2 ? "#2ecc71" : "#f6d55c");
          rect(ctx, 6, y + 1, 1, 1, "#2ecc71");
        }
      },
    },
    cctv_desk: {
      w: 32, h: 28, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 0, 14, 32, 7, "#556270", "#2f3a46");
        outlineBox(ctx, 1, 20, 30, 8, "#47525e", "#2f3a46");
        for (const [x, y] of [[2, 1], [11, 1], [20, 1], [6, 7], [16, 7]]) {
          outlineBox(ctx, x, y, 10, 7, "#3f6a5a", "#1d2229");
          rect(ctx, x + 2, y + 2, 4, 2, "#8fd0b0");
        }
        rect(ctx, 10, 16, 12, 2, "#2b2b2b");
      },
    },
    guard_post: {
      w: 32, h: 22, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 0, 6, 32, 8, "#8395a7", "#2f3a46");
        outlineBox(ctx, 1, 13, 30, 9, "#556270", "#2f3a46");
        rect(ctx, 4, 16, 24, 1, "#47525e");
        // журнал
        rect(ctx, 5, 4, 14, 6, "#2f3a46");
        rect(ctx, 6, 4, 6, 5, "#f7f4ec");
        rect(ctx, 12, 4, 6, 5, "#f2ecdc");
        rect(ctx, 7, 5, 4, 1, "#9aa5b1");
        rect(ctx, 13, 6, 4, 1, "#9aa5b1");
        // ящик с ключами и пломбой
        outlineBox(ctx, 22, 1, 7, 7, "#a5b1bd", "#2f3a46");
        rect(ctx, 25, 4, 2, 2, "#d63c3c");
      },
    },
    coffee_machine: {
      w: 16, h: 22, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 2, 0, 12, 22, "#2b2f36", "#111418");
        rect(ctx, 4, 2, 8, 4, "#8fd0f0");
        rect(ctx, 5, 3, 3, 1, "#e9f7fd");
        rect(ctx, 5, 9, 6, 6, "#1d2229");
        outlineBox(ctx, 6, 11, 4, 4, "#f7f4ec", "#9aa5b1");
        rect(ctx, 4, 17, 2, 2, "#d63c3c");
        rect(ctx, 10, 17, 2, 2, "#2ecc71");
      },
    },
    vending: {
      w: 16, h: 30, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 0, 0, 16, 30, "#c0392b", "#5a1a14");
        outlineBox(ctx, 2, 3, 9, 18, "#cfe8f2", "#5a1a14");
        const snacks = ["#f6d55c", "#2e9e5b", "#2f6fd6", "#e07a9b"];
        for (let row = 0; row < 4; row++)
          for (let col = 0; col < 3; col++) rect(ctx, 3 + col * 3, 4 + row * 4, 2, 3, snacks[(row + col) % 4]);
        rect(ctx, 12, 5, 2, 6, "#2b2b2b");
        rect(ctx, 12, 13, 2, 2, "#f6d55c");
        rect(ctx, 3, 24, 8, 3, "#2b2b2b");
      },
    },
    water_cooler: {
      w: 16, h: 26, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 4, 0, 8, 9, "#8fd0f0", "#2e6d8e");
        rect(ctx, 5, 1, 2, 6, "#c9ecfb");
        outlineBox(ctx, 3, 9, 10, 16, "#eef1f4", "#5c6670");
        rect(ctx, 5, 12, 2, 2, "#d63c3c");
        rect(ctx, 9, 12, 2, 2, "#2f6fd6");
      },
    },
    safe: {
      w: 16, h: 18, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 1, 2, 14, 16, "#4a525c", "#1d2229");
        outlineBox(ctx, 3, 4, 10, 12, "#5c6670", "#1d2229");
        rect(ctx, 7, 8, 3, 3, "#c9d1d9");
        rect(ctx, 8, 9, 1, 1, "#1d2229");
        rect(ctx, 11, 9, 1, 3, "#c9d1d9");
      },
    },
  },
};
