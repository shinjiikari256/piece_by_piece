import type { CaseFile, CustomPart, PartSlot } from "../../../../../shared/case";
import { BUILTIN_PARTS, PARTS, PART_NAMES } from "../../game/art";
import { uniqueKey } from "./helpers";

export type PartOp = CustomPart["frames"][string][number];

/** Адрес части в списке и в адресной строке: `слот/ключ`. */
export const partId = (slot: PartSlot, key: string): string => `${slot}/${key}`;
export const splitPartId = (id: string): [PartSlot, string] | null => {
  const i = id.indexOf("/");
  return i > 0 ? [id.slice(0, i) as PartSlot, id.slice(i + 1)] : null;
};

export const isBuiltinPart = (slot: PartSlot, key: string): boolean => BUILTIN_PARTS[slot].includes(key);

/** Часть для показа в редакторе: часть дела или встроенная, приведённая к виду части дела. */
export function partView(d: Pick<CaseFile, "parts">, slot: PartSlot, key: string): CustomPart | null {
  const own = d.parts?.find((p) => p.slot === slot && p.key === key);
  if (own) return own;
  const spec = PARTS[slot][key];
  if (!spec || !isBuiltinPart(slot, key)) return null;
  return JSON.parse(JSON.stringify({ key, slot, name: PART_NAMES[slot][key] ?? key, ...spec })) as CustomPart;
}

/** Все части слота: встроенные, затем части дела. */
export const slotKeys = (d: Pick<CaseFile, "parts">, slot: PartSlot): string[] => [...BUILTIN_PARTS[slot], ...(d.parts ?? []).filter((p) => p.slot === slot).map((p) => p.key)];

const takenIn = (d: Pick<CaseFile, "parts">, slot: PartSlot) => (k: string) => k in PARTS[slot] || !!d.parts?.some((p) => p.slot === slot && p.key === k);

export const newPart = (d: Pick<CaseFile, "parts">, slot: PartSlot): CustomPart => ({
  key: uniqueKey("part", takenIn(d, slot)),
  name: "Новая часть",
  slot,
  bob: true,
  frames: { default: [] },
});

export function copyPart(d: Pick<CaseFile, "parts">, src: CustomPart): CustomPart {
  const { key: _k, ...rest } = JSON.parse(JSON.stringify(src)) as CustomPart;
  return { ...rest, key: uniqueKey(`${src.key}_copy`, takenIn(d, src.slot)), name: `${src.name} (копия)` };
}

export const patchPart = (d: CaseFile, slot: PartSlot, key: string, patch: Partial<CustomPart>): CaseFile => ({
  ...d,
  parts: d.parts?.map((p) => (p.slot === slot && p.key === key ? { ...p, ...patch } : p)),
});

export const setPartOps = (d: CaseFile, slot: PartSlot, key: string, pose: string, ops: PartOp[]): CaseFile =>
  patchPart(d, slot, key, { frames: { ...(d.parts?.find((p) => p.slot === slot && p.key === key)?.frames ?? { default: [] }), [pose]: ops } });

/** Кто использует часть: «персонаж: …». */
export function partUses(d: Pick<CaseFile, "characters">, slot: PartSlot, key: string): string[] {
  return d.characters
    .filter((c) => {
      const a = c.appearance;
      if (!a) return false;
      return slot === "hair" ? a.hairStyle === key : slot === "accent" ? a.accentStyle === key : slot === "bottom" ? a.bottom === key : !!a.faceParts?.includes(key);
    })
    .map((c) => c.name || c.id);
}

/** Убрать кадр позы (кадр `default` удалять нельзя). */
export function withoutPose(frames: CustomPart["frames"], pose: string): CustomPart["frames"] {
  if (pose === "default") return frames;
  return Object.fromEntries(Object.entries(frames).filter(([k]) => k !== pose)) as CustomPart["frames"];
}
