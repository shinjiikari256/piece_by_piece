import { PartSlot } from "../../../../../../shared/case";
import type { Ctx } from "../common";
import hair from "./parts/hair.json";
import accent from "./parts/accent.json";
import face from "./parts/face.json";
import bottom from "./parts/bottom.json";

/** Слоты частей персонажа; порядок в `PART_SLOTS` — порядок показа в редакторе. */
export const PART_SLOTS = PartSlot.options;
export type { PartSlot };

/** Операция части: (x, y, ширина, высота, цвет); цвет — `#rrggbb[aa]` или роль внешности `$skin`; без цвета — ластик. */
export type PartOp = [x: number, y: number, w: number, h: number, color?: string];

export interface PartSpec {
  /** На позе `idle2` (персонаж «вдохнул») все операции кадра `default` сдвигаются на 1 px вниз, если своего кадра нет. */
  bob?: boolean;
  /** Цвет ног под этой частью (юбка: ноги в колготках `$skinShade`); по умолчанию `$legs`. */
  legs?: string;
  /** Кадры по позам (`idle`, `idle2`, `walk1`, `walk2`, `talk`): `default` — для всех поз без своего кадра. */
  frames: { default: PartOp[] } & Record<string, PartOp[]>;
}

interface PartFile {
  slot: PartSlot;
  label: string;
  parts: Record<string, PartSpec & { name: string }>;
}

/** Роли цвета, которые части берут у внешности. */
export const PART_ROLES = ["$skin", "$skinShade", "$hair", "$top", "$topShade", "$accent", "$legs", "$legsShade", "$legsDark", "$shoes", "$eyes", "$glassesColor"] as const;
export const ROLE_NAMES: Record<string, string> = {
  $skin: "кожа", $skinShade: "кожа в тени", $hair: "волосы", $top: "верх", $topShade: "верх в тени", $accent: "деталь",
  $legs: "низ", $legsShade: "низ в тени", $legsDark: "низ, складка", $shoes: "обувь", $eyes: "глаза", $glassesColor: "оправа",
};

const FILES = [hair, accent, face, bottom] as unknown as PartFile[];

/** Встроенные части по слотам и ключам. */
export const PARTS: Record<PartSlot, Record<string, PartSpec>> = { hair: {}, accent: {}, face: {}, bottom: {} };
/** Подписи частей: слот → ключ → название. */
export const PART_NAMES: Record<PartSlot, Record<string, string>> = { hair: {}, accent: {}, face: {}, bottom: {} };
export const PART_SLOT_LABELS: Record<PartSlot, string> = { hair: "", accent: "", face: "", bottom: "" };
for (const f of FILES) {
  PART_SLOT_LABELS[f.slot] = f.label;
  for (const [key, { name, ...spec }] of Object.entries(f.parts)) {
    PARTS[f.slot][key] = spec;
    PART_NAMES[f.slot][key] = name;
  }
}
/** Ключи встроенных частей. */
export const BUILTIN_PARTS: Record<PartSlot, string[]> = {
  hair: Object.keys(PARTS.hair),
  accent: Object.keys(PARTS.accent),
  face: Object.keys(PARTS.face),
  bottom: Object.keys(PARTS.bottom),
};

/** Часть по слоту и ключу (нет такой — `undefined`). */
export const partOf = (slot: PartSlot, key: string | undefined): PartSpec | undefined => (key !== undefined && Object.hasOwn(PARTS[slot], key) ? PARTS[slot][key] : undefined);

/** Операции части для позы: свой кадр, иначе `default` (со сдвигом на `idle2`, если `bob`). */
export function partOps(spec: PartSpec, pose: string): PartOp[] {
  const own = spec.frames[pose];
  if (own) return own;
  if (pose === "idle2" && spec.bob) return spec.frames.default.map(([x, y, w, h, c]) => [x, y + 1, w, h, c]);
  return spec.frames.default;
}

/** Нарисовать часть: роли цвета подставляются из `roles`. */
export function drawPart(ctx: Ctx, spec: PartSpec | undefined, roles: Record<string, string>, pose: string, ox: number) {
  if (!spec) return;
  for (const [x, y, w, h, color] of partOps(spec, pose)) {
    if (color === undefined) {
      ctx.clearRect(ox + x, y, w, h);
    } else {
      ctx.fillStyle = color.startsWith("$") ? (roles[color] ?? "#00000000") : color;
      ctx.fillRect(ox + x, y, w, h);
    }
  }
}
