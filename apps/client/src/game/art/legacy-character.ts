import { rect, type Ctx } from "./common";
import type { CharFrame, Look } from "./characters";

/**
 * Прежняя отрисовка персонажа кодом — эталон для теста: части из данных (`characters/parts`) обязаны
 * рисовать ровно то же самое. Только для тестов и скрипта конвертации.
 */
/** Темнее на долю amount — для теней одежды. */
function shade(hex: string, amount = 0.2): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) =>
    Math.round(v * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

export function drawCharacterLegacy(ctx: Ctx, look: Look, frame: CharFrame, ox: number) {
  const O = "#2a2320";
  const bob = frame === "idle2" ? 1 : 0;
  const leftLift = frame === "walk1" ? 1 : 0;
  const rightLift = frame === "walk2" ? 1 : 0;
  const r = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, y, w, h, c);

  // тень
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(ox + 3, 22, 10, 2);

  // ноги и обувь (под юбкой — ноги в колготках цвета кожи)
  const skirt = look.bottom === "skirt";
  const legColor = skirt ? shade(look.skin, 0.12) : look.legs;
  r(4, 16, 4, 6 - leftLift, O);
  r(8, 16, 4, 6 - rightLift, O);
  r(5, 16, 2, 4 - leftLift, legColor);
  r(9, 16, 2, 4 - rightLift, legColor);
  r(5, 20 - leftLift, 2, 1, look.shoes);
  r(9, 20 - rightLift, 2, 1, look.shoes);
  if (skirt) {
    r(3, 15, 10, 5, O);
    r(4, 15, 8, 4, look.legs);
    r(10, 15, 2, 4, shade(look.legs));
    r(4, 18, 8, 1, shade(look.legs, 0.3));
  }

  // корпус
  r(3, 9 + bob, 10, 8 - bob, O);
  r(4, 10 + bob, 8, 6 - bob, look.top);
  r(10, 10 + bob, 2, 6 - bob, look.topShade);
  // руки
  r(2, 10 + bob, 2, 6, O);
  r(12, 10 + bob, 2, 6, O);
  r(2, 11 + bob, 1, 4, look.top);
  r(13, 11 + bob, 1, 4, look.topShade);
  r(2, 15 + bob, 1, 1, look.skin);
  r(13, 15 + bob, 1, 1, look.skin);

  switch (look.accentStyle) {
    case "tie":
      r(6, 10 + bob, 4, 2, "#f4f4f4");
      r(7, 11 + bob, 2, 4, look.accent);
      break;
    case "scarf":
      r(4, 10 + bob, 8, 2, look.accent);
      r(9, 12 + bob, 2, 3, look.accent);
      break;
    case "collar":
      r(6, 10 + bob, 4, 1, look.accent);
      break;
    case "badge":
      r(9, 11 + bob, 2, 2, look.accent);
      r(5, 10 + bob, 6, 1, look.topShade);
      break;
    case "apron":
      r(5, 11 + bob, 6, 5 - bob, look.accent);
      r(6, 10 + bob, 4, 1, look.accent);
      break;
  }

  // голова
  const hy = bob;
  r(3, 1 + hy, 10, 9, O);
  r(4, 2 + hy, 8, 7, look.skin);
  r(11, 3 + hy, 1, 6, "rgba(0,0,0,0.08)");
  // глаза и рот
  const eyes = look.eyes ?? "#2a2320";
  r(6, 5 + hy, 1, 1, eyes);
  r(9, 5 + hy, 1, 1, eyes);
  r(6, 6 + hy, 1, 1, "#2a2320");
  r(9, 6 + hy, 1, 1, "#2a2320");
  r(5, 7 + hy, 1, 1, "rgba(220,120,120,0.45)");
  r(10, 7 + hy, 1, 1, "rgba(220,120,120,0.45)");
  if (frame === "talk") r(7, 7 + hy, 2, 2, "#8a3b3b");
  else r(7, 8 + hy, 2, 1, "#a65a4f");
  if (look.beard) {
    r(4, 7 + hy, 8, 3, look.hair);
    r(7, 8 + hy, 2, 1, frame === "talk" ? "#8a3b3b" : "#7a4a3a");
  }
  if (look.mustache) r(6, 7 + hy, 4, 1, look.hair);
  if (look.glasses) {
    const frameColor = look.glassesColor ?? "#2a2320";
    // светлые стёкла по бокам от глаз и тонкая оправа сверху — глаза остаются видны
    const lens = "rgba(200,230,255,0.75)";
    r(5, 5 + hy, 1, 2, lens);
    r(7, 5 + hy, 2, 2, lens);
    r(10, 5 + hy, 1, 2, lens);
    r(5, 4 + hy, 6, 1, frameColor);
  }

  // волосы
  switch (look.hairStyle) {
    case "short":
      r(3, 0 + hy, 10, 4, O);
      r(4, 1 + hy, 8, 3, look.hair);
      r(4, 4 + hy, 1, 2, look.hair);
      r(11, 4 + hy, 1, 2, look.hair);
      break;
    case "long":
      r(3, 0 + hy, 10, 4, O);
      r(4, 1 + hy, 8, 3, look.hair);
      r(2, 3 + hy, 3, 10, O);
      r(11, 3 + hy, 3, 10, O);
      r(3, 3 + hy, 2, 9, look.hair);
      r(11, 3 + hy, 2, 9, look.hair);
      break;
    case "bun":
      r(5, -1 + hy + 1, 6, 2, O);
      r(6, 0 + hy + 1, 4, 1, look.hair);
      r(3, 1 + hy, 10, 3, O);
      r(4, 2 + hy, 8, 2, look.hair);
      r(4, 4 + hy, 1, 2, look.hair);
      r(11, 4 + hy, 1, 2, look.hair);
      break;
    case "cap":
      r(3, 0 + hy, 10, 4, O);
      r(4, 1 + hy, 8, 2, look.hair);
      r(3, 3 + hy, 11, 1, "#121a2c");
      r(7, 1 + hy, 2, 1, "#f1c40f");
      break;
    case "ponytail":
      r(3, 0 + hy, 10, 4, O);
      r(4, 1 + hy, 8, 3, look.hair);
      r(4, 4 + hy, 1, 2, look.hair);
      r(12, 2 + hy, 3, 8, O);
      r(13, 3 + hy, 1, 6, look.hair);
      r(12, 3 + hy, 1, 1, "#e07a9b");
      break;
    case "curly":
      r(2, 0 + hy, 12, 5, O);
      for (const x of [3, 5, 7, 9, 11]) r(x, 0 + hy, 2, 2, look.hair);
      r(3, 2 + hy, 10, 2, look.hair);
      r(3, 4 + hy, 2, 2, look.hair);
      r(11, 4 + hy, 2, 2, look.hair);
      break;
    case "bald":
      r(3, 4 + hy, 1, 3, look.hair);
      r(12, 4 + hy, 1, 3, look.hair);
      r(6, 2 + hy, 3, 1, "rgba(255,255,255,0.35)");
      break;
    case "bob":
      r(3, 0 + hy, 10, 4, O);
      r(4, 1 + hy, 8, 3, look.hair);
      r(2, 3 + hy, 3, 7, O);
      r(11, 3 + hy, 3, 7, O);
      r(3, 3 + hy, 2, 6, look.hair);
      r(11, 3 + hy, 2, 6, look.hair);
      break;
    case "headscarf":
      r(2, 0 + hy, 12, 5, O);
      r(3, 1 + hy, 10, 3, look.hair);
      r(2, 3 + hy, 3, 8, O);
      r(11, 3 + hy, 3, 8, O);
      r(3, 3 + hy, 2, 7, look.hair);
      r(11, 3 + hy, 2, 7, look.hair);
      r(6, 1 + hy, 4, 1, "rgba(255,255,255,0.35)");
      break;
  }
}
