import type { AccentStyle, Appearance, CustomLook, HairStyle } from "../../../../../shared/case";
import { rect, type Ctx } from "./common";
import { drawPart, partOf } from "./characters/parts";

// ---------- Персонажи ----------

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  topShade: string;
  accent: string;
  accentStyle: AccentStyle;
  legs: string;
  shoes: string;
  glasses?: boolean;
  mustache?: boolean;
  beard?: boolean;
  /** Цвет глаз (по умолчанию тёмный). */
  eyes?: string;
  glassesColor?: string;
  bottom?: "pants" | "skirt";
}

export const LOOKS: Record<Appearance | "player", Look> = {
  // дознаватель: тёмно-синий форменный китель, светлая рубашка, галстук
  player: {
    skin: "#f1c7a1", hair: "#3b2a20", hairStyle: "short",
    top: "#24364f", topShade: "#1b2a3e", accent: "#0f1824", accentStyle: "tie",
    legs: "#1b2a3e", shoes: "#111418",
  },
  student_f: {
    skin: "#f3cfae", hair: "#8a4b2a", hairStyle: "long",
    top: "#5b8fd6", topShade: "#4774b3", accent: "#f1f1f1", accentStyle: "collar",
    legs: "#2f3a56", shoes: "#f1f1f1",
  },
  student_m: {
    skin: "#e2b48c", hair: "#1e1a18", hairStyle: "short",
    top: "#c0392b", topShade: "#9b2d22", accent: "#f1f1f1", accentStyle: "collar",
    legs: "#2b2f3a", shoes: "#f1f1f1",
  },
  official_m: {
    skin: "#e9bd96", hair: "#6b6b6b", hairStyle: "short",
    top: "#4a5568", topShade: "#3a4354", accent: "#c0392b", accentStyle: "tie",
    legs: "#2d3340", shoes: "#16191e",
  },
  official_m_senior: {
    skin: "#e3b08a", hair: "#b9b9b9", hairStyle: "short",
    top: "#5b4a3a", topShade: "#47392c", accent: "#2b4c7e", accentStyle: "tie",
    legs: "#3a332c", shoes: "#16191e", mustache: true,
  },
  official_f: {
    skin: "#f1c9a8", hair: "#4a2f22", hairStyle: "bun",
    top: "#4a5568", topShade: "#3a4354", accent: "#ffffff", accentStyle: "collar",
    legs: "#2d3340", shoes: "#16191e",
  },
  teacher_f: {
    skin: "#f1c9a8", hair: "#c9a15a", hairStyle: "bun",
    top: "#8e5ea2", topShade: "#744a86", accent: "#ffffff", accentStyle: "collar",
    legs: "#3c3c50", shoes: "#5a2f2f", glasses: true, glassesColor: "#a0701a", bottom: "skirt",
  },
  teacher_m: {
    skin: "#ecc19c", hair: "#8a8a8a", hairStyle: "short",
    top: "#6b4f3a", topShade: "#563f2e", accent: "#2b4c7e", accentStyle: "tie",
    legs: "#3a3a40", shoes: "#2a1f18", glasses: true,
  },
  guard_m: {
    skin: "#dcae86", hair: "#1f2a44", hairStyle: "cap",
    top: "#2c3e66", topShade: "#22314f", accent: "#f1c40f", accentStyle: "badge",
    legs: "#1f2a44", shoes: "#111418",
  },
  casual_m: {
    skin: "#f0c8a4", hair: "#2b2b2b", hairStyle: "short",
    top: "#2e9e5b", topShade: "#25804a", accent: "#f1f1f1", accentStyle: "collar",
    legs: "#45413a", shoes: "#22262c",
  },
  casual_f: {
    skin: "#f3cfae", hair: "#d9a441", hairStyle: "long",
    top: "#e07a9b", topShade: "#c4607f", accent: "#ffffff", accentStyle: "collar",
    legs: "#3b4a6b", shoes: "#f1f1f1",
  },
  student_f2: {
    skin: "#e8b98f", hair: "#1e1a18", hairStyle: "ponytail",
    top: "#8e44ad", topShade: "#723690", accent: "#f1f1f1", accentStyle: "collar",
    legs: "#2b2f3a", shoes: "#f1f1f1",
  },
  student_m2: {
    skin: "#f1c7a1", hair: "#5a3a22", hairStyle: "curly",
    top: "#3c6e9e", topShade: "#2f5880", accent: "#f1f1f1", accentStyle: "collar",
    legs: "#45413a", shoes: "#22262c", glasses: true,
  },
  professor_m: {
    skin: "#efc5a0", hair: "#9a9a9a", hairStyle: "bald",
    top: "#6b4f3a", topShade: "#563f2e", accent: "#7a2f2f", accentStyle: "tie",
    legs: "#3a3a40", shoes: "#2a1f18", glasses: true, beard: true,
  },
  official_f2: {
    skin: "#f1c9a8", hair: "#2b1d16", hairStyle: "bob",
    top: "#b03a2e", topShade: "#8f2e25", accent: "#ffffff", accentStyle: "collar",
    legs: "#2d3340", shoes: "#16191e", bottom: "skirt",
  },
  it_m: {
    skin: "#f0c8a4", hair: "#c9a15a", hairStyle: "short",
    top: "#2b2b2b", topShade: "#1c1c1c", accent: "#2ecc71", accentStyle: "badge",
    legs: "#3b4a6b", shoes: "#f1f1f1", beard: true,
  },
  cleaner_f: {
    skin: "#e2b48c", hair: "#3c6e9e", hairStyle: "headscarf",
    top: "#7f9c8a", topShade: "#6a8574", accent: "#f4f4f4", accentStyle: "apron",
    legs: "#45413a", shoes: "#22262c",
  },
  doctor_f: {
    skin: "#f3cfae", hair: "#8a4b2a", hairStyle: "bun",
    top: "#f4f4f4", topShade: "#d9dde2", accent: "#2f6fd6", accentStyle: "collar",
    legs: "#2f6fd6", shoes: "#f1f1f1",
  },
  elder_f: {
    skin: "#efc5a0", hair: "#d9d9d9", hairStyle: "bun",
    top: "#7d4b6e", topShade: "#653c59", accent: "#ffffff", accentStyle: "collar",
    legs: "#5a4636", shoes: "#5a2f2f", glasses: true, glassesColor: "#b9b9b9", bottom: "skirt",
  },
  worker_m: {
    skin: "#dcae86", hair: "#d35400", hairStyle: "cap",
    top: "#3c6e9e", topShade: "#2f5880", accent: "#f6d55c", accentStyle: "badge",
    legs: "#3c6e9e", shoes: "#2a1f18", mustache: true,
  },
  sport_m: {
    skin: "#f1c7a1", hair: "#3b2a20", hairStyle: "short",
    top: "#f39c12", topShade: "#d68910", accent: "#ffffff", accentStyle: "collar",
    legs: "#2b2f3a", shoes: "#f1f1f1",
  },
};

/** Темнее на долю amount — для теней одежды. */
export function shade(hex: string, amount = 0.2): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v * (1 - amount)).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** Своя внешность → то, что умеет рисовать drawCharacter. */
export function lookFromCustom(c: CustomLook): Look {
  return { ...c, topShade: shade(c.top) };
}

/** Готовый облик → редактируемая внешность (для «настроить на основе образца»). */
export function customFromLook(l: Look): CustomLook {
  return {
    skin: l.skin,
    hair: l.hair,
    hairStyle: l.hairStyle,
    top: l.top,
    accent: l.accent,
    accentStyle: l.accentStyle,
    legs: l.legs,
    shoes: l.shoes,
    glasses: !!l.glasses,
    mustache: !!l.mustache,
    beard: !!l.beard,
    eyes: l.eyes ?? "#2a2320",
    glassesColor: l.glassesColor ?? "#2a2320",
    bottom: l.bottom ?? "pants",
  };
}

/** Как выглядит персонаж: своя внешность важнее готового облика. */
export function resolveLook(c: { look: Appearance; appearance?: CustomLook }): Look {
  return c.appearance ? lookFromCustom(c.appearance) : LOOKS[c.look];
}

export const CHAR_W = 16;
export const CHAR_H = 24;
export type CharFrame = "idle" | "idle2" | "walk1" | "walk2" | "talk";
export const CHAR_FRAMES: CharFrame[] = ["idle", "idle2", "walk1", "walk2", "talk"];

/** Цвета ролей внешности для частей. */
export function lookRoles(look: Look): Record<string, string> {
  return {
    $skin: look.skin, $skinShade: shade(look.skin, 0.12), $hair: look.hair, $top: look.top, $topShade: look.topShade, $accent: look.accent,
    $legs: look.legs, $legsShade: shade(look.legs), $legsDark: shade(look.legs, 0.3), $shoes: look.shoes,
    $eyes: look.eyes ?? "#2a2320", $glassesColor: look.glassesColor ?? "#2a2320",
  };
}

export function drawCharacter(ctx: Ctx, look: Look, frame: CharFrame, ox: number) {
  const O = "#2a2320";
  const bob = frame === "idle2" ? 1 : 0;
  const leftLift = frame === "walk1" ? 1 : 0;
  const rightLift = frame === "walk2" ? 1 : 0;
  const r = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, ox + x, y, w, h, c);
  const roles = lookRoles(look);

  // тень
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(ox + 3, 22, 10, 2);

  // ноги и обувь (под юбкой — ноги в колготках цвета кожи)
  const skirt = partOf("bottom", look.bottom);
  const legColor = skirt ? roles[skirt.legs ?? "$legs"] : look.legs;
  r(4, 16, 4, 6 - leftLift, O);
  r(8, 16, 4, 6 - rightLift, O);
  r(5, 16, 2, 4 - leftLift, legColor);
  r(9, 16, 2, 4 - rightLift, legColor);
  r(5, 20 - leftLift, 2, 1, look.shoes);
  r(9, 20 - rightLift, 2, 1, look.shoes);
  drawPart(ctx, skirt, roles, frame, ox);

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

  drawPart(ctx, partOf("accent", look.accentStyle), roles, frame, ox);

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
  if (look.beard) drawPart(ctx, partOf("face", "beard"), roles, frame, ox);
  if (look.mustache) drawPart(ctx, partOf("face", "mustache"), roles, frame, ox);
  if (look.glasses) drawPart(ctx, partOf("face", "glasses"), roles, frame, ox);

  // волосы
  drawPart(ctx, partOf("hair", look.hairStyle), roles, frame, ox);
}
