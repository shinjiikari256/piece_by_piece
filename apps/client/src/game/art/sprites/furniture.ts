import { rect, type Ctx } from "../common";
import { outlineBox } from "./helpers";
import type { SpriteGroup } from "./types";

export function drawDeskBase(ctx: Ctx, w: number, h: number) {
  // столешница и фасад
  outlineBox(ctx, 0, h - 16, w, 7, "#b07a44");
  rect(ctx, 1, h - 15, w - 2, 1, "#c8925a");
  outlineBox(ctx, 1, h - 10, w - 2, 9, "#8a5c31");
  rect(ctx, 4, h - 7, 8, 1, "#6e4824");
  rect(ctx, 7, h - 6, 2, 1, "#d8b27a");
  rect(ctx, w - 12, h - 7, 8, 1, "#6e4824");
  rect(ctx, w - 9, h - 6, 2, 1, "#d8b27a");
}

export const furniture: SpriteGroup = {
  id: "furniture",
  label: "Мебель",
  sprites: {
    desk: {
      w: 32, h: 22, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        drawDeskBase(ctx, 32, 22);
        // бумаги
        rect(ctx, 6, 7, 8, 5, "#f7f4ec");
        rect(ctx, 7, 8, 6, 1, "#b9c2cc");
        rect(ctx, 7, 10, 4, 1, "#b9c2cc");
        rect(ctx, 18, 6, 7, 6, "#efe6cf");
        rect(ctx, 22, 6, 3, 2, "#f6d55c");
        rect(ctx, 27, 8, 2, 3, "#3c6e9e");
      },
    },
    computer_desk: {
      w: 32, h: 26, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        drawDeskBase(ctx, 32, 26);
        // монитор повёрнут к сидящему за столом — нам видна задняя крышка
        outlineBox(ctx, 8, 0, 16, 12, "#4a525c", "#1d2229");
        rect(ctx, 10, 2, 12, 8, "#3d434c");
        rect(ctx, 12, 3, 8, 1, "#2f353d");
        rect(ctx, 12, 5, 8, 1, "#2f353d");
        rect(ctx, 15, 7, 2, 2, "#9aa5b1");
        rect(ctx, 14, 12, 4, 2, "#1d2229");
        // провод и стопка бумаг
        rect(ctx, 23, 10, 1, 4, "#1d2229");
        rect(ctx, 3, 12, 4, 3, "#f7f4ec");
      },
    },
    chair: {
      w: 16, h: 16, footprint: { w: 1, h: 1 }, solid: false,
      draw(ctx) {
        outlineBox(ctx, 3, 1, 10, 8, "#3c4f66", "#1f2a36");
        outlineBox(ctx, 2, 8, 12, 5, "#4c6380", "#1f2a36");
        rect(ctx, 4, 13, 1, 3, "#1f2a36");
        rect(ctx, 11, 13, 1, 3, "#1f2a36");
      },
    },
    armchair: {
      w: 16, h: 20, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 1, 0, 14, 10, "#2e6b5a", "#173a30");
        outlineBox(ctx, 0, 8, 16, 9, "#3f8f78", "#173a30");
        outlineBox(ctx, 0, 5, 3, 12, "#2e6b5a", "#173a30");
        outlineBox(ctx, 13, 5, 3, 12, "#2e6b5a", "#173a30");
        rect(ctx, 2, 17, 2, 3, "#3b2f25");
        rect(ctx, 12, 17, 2, 3, "#3b2f25");
      },
    },
    sofa: {
      w: 32, h: 20, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 0, 0, 32, 9, "#7d4b6e", "#3f2338");
        outlineBox(ctx, 0, 8, 32, 9, "#955a83", "#3f2338");
        outlineBox(ctx, 0, 4, 4, 13, "#6c3f5f", "#3f2338");
        outlineBox(ctx, 28, 4, 4, 13, "#6c3f5f", "#3f2338");
        rect(ctx, 15, 9, 1, 7, "#7d4b6e");
        rect(ctx, 3, 17, 2, 3, "#3b2f25");
        rect(ctx, 27, 17, 2, 3, "#3b2f25");
      },
    },
    bed: {
      w: 16, h: 30, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        // изголовье у стены, вид сверху
        outlineBox(ctx, 0, 0, 16, 30, "#8a5c31");
        outlineBox(ctx, 1, 2, 14, 27, "#e9edf2", "#9aa5b1");
        outlineBox(ctx, 3, 3, 10, 5, "#ffffff", "#c3cbd4");
        outlineBox(ctx, 1, 11, 14, 18, "#4f7fbf", "#34598c");
        rect(ctx, 2, 12, 12, 1, "#6b97d1");
        rect(ctx, 4, 18, 8, 1, "#3f6aa3");
        rect(ctx, 4, 23, 8, 1, "#3f6aa3");
      },
    },
    bench: {
      w: 32, h: 14, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 0, 0, 32, 5, "#a8743f");
        outlineBox(ctx, 0, 5, 32, 5, "#bf8a52");
        rect(ctx, 2, 10, 2, 4, "#3b2f25");
        rect(ctx, 28, 10, 2, 4, "#3b2f25");
      },
    },
    round_table: {
      w: 32, h: 22, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        rect(ctx, 4, 4, 24, 12, "#6e4824");
        rect(ctx, 2, 6, 28, 8, "#6e4824");
        rect(ctx, 5, 5, 22, 10, "#b07a44");
        rect(ctx, 3, 7, 26, 6, "#b07a44");
        rect(ctx, 8, 6, 8, 1, "#c8925a");
        rect(ctx, 15, 16, 2, 5, "#3b2f25");
        rect(ctx, 10, 20, 12, 2, "#3b2f25");
        rect(ctx, 18, 8, 4, 3, "#f7f4ec");
      },
    },
    cabinet: {
      w: 16, h: 30, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 0, 0, 16, 30, "#9c7a4e");
        rect(ctx, 1, 1, 14, 2, "#b58f5e");
        for (const y of [5, 13, 21]) {
          outlineBox(ctx, 2, y, 12, 7, "#8a6a42", "#5c4428");
          rect(ctx, 6, y + 3, 4, 1, "#e0c690");
        }
      },
    },
    bookshelf: {
      w: 32, h: 30, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        outlineBox(ctx, 0, 0, 32, 30, "#7a5432");
        const colors = ["#c0392b", "#2f6fd6", "#e0b23c", "#2e9e5b", "#8e5ea2", "#e8e2d0", "#d35400"];
        for (const sy of [2, 11, 20]) {
          rect(ctx, 1, sy + 7, 30, 2, "#5c3d22");
          let x = 2;
          let i = sy;
          while (x < 29) {
            const w = 2 + (i % 2);
            const h = 5 + (i % 3);
            rect(ctx, x, sy + 7 - h, w, h, colors[i % colors.length]);
            x += w + (i % 4 === 0 ? 1 : 0);
            i++;
          }
        }
      },
    },
    lockers: {
      w: 32, h: 30, footprint: { w: 2, h: 1 }, solid: true,
      draw(ctx) {
        for (const x of [0, 8, 16, 24]) {
          outlineBox(ctx, x, 0, 8, 30, "#7f8c99", "#3d4650");
          rect(ctx, x + 2, 3, 4, 1, "#3d4650");
          rect(ctx, x + 2, 5, 4, 1, "#3d4650");
          rect(ctx, x + 5, 14, 1, 3, "#c9d1d9");
        }
        rect(ctx, 9, 20, 6, 3, "#f6d55c");
      },
    },
    coat_rack: {
      w: 16, h: 28, footprint: { w: 1, h: 1 }, solid: true,
      draw(ctx) {
        rect(ctx, 7, 4, 2, 22, "#5c3d22");
        rect(ctx, 4, 25, 8, 2, "#5c3d22");
        outlineBox(ctx, 2, 3, 6, 11, "#3c6e9e", "#22405e");
        outlineBox(ctx, 9, 5, 5, 8, "#b8894f", "#6b4a2b");
        rect(ctx, 6, 1, 4, 3, "#5c3d22");
      },
    },
  },
};
