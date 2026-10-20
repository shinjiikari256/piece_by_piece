import type { CaseFile, CustomSprite } from "../../../../../shared/case";
import { SPRITES, SPRITE_GROUPS, SPRITE_NAMES } from "../../game/art";
import { uniqueKey } from "./helpers";

/** Название группы по умолчанию для спрайтов без группы. */
export const DEFAULT_GROUP = "Свои";

const builtinGroup = new Map<string, string>(SPRITE_GROUPS.flatMap((g) => Object.keys(g.sprites).map((k) => [k, g.label] as const)));

/** Встроенный ли спрайт (его нельзя менять и удалять — только копировать). */
export const isBuiltin = (key: string): boolean => builtinGroup.has(key);

/** Спрайт для показа в редакторе: встроенный приводится к виду спрайта дела. */
export function spriteView(d: CaseFile, key: string): CustomSprite | null {
  const own = d.sprites?.find((s) => s.key === key);
  if (own) return own;
  const spec = SPRITES[key];
  if (!spec || !isBuiltin(key)) return null;
  return JSON.parse(JSON.stringify({ key, name: SPRITE_NAMES[key] ?? key, group: builtinGroup.get(key), ...spec })) as CustomSprite;
}

export interface SpriteGroupList {
  id: string;
  label: string;
  keys: string[];
}

/** Группы палитры и списка спрайтов: встроенные, в них же — спрайты дела с той же группой; остальные группы дела — следом. */
export function spriteGroups(d: Pick<CaseFile, "sprites">): SpriteGroupList[] {
  const extra = new Map<string, string[]>();
  for (const s of d.sprites ?? []) {
    const label = s.group?.trim() || DEFAULT_GROUP;
    extra.set(label, [...(extra.get(label) ?? []), s.key]);
  }
  const out: SpriteGroupList[] = SPRITE_GROUPS.map((g) => ({ id: g.id, label: g.label, keys: [...Object.keys(g.sprites), ...(extra.get(g.label) ?? [])] }));
  for (const [label, keys] of extra) if (!SPRITE_GROUPS.some((g) => g.label === label)) out.push({ id: `custom:${label}`, label, keys });
  return out;
}

/** Все названия групп для выбора. */
export const groupLabels = (d: Pick<CaseFile, "sprites">): string[] => {
  const all = [...SPRITE_GROUPS.map((g) => g.label), DEFAULT_GROUP, ...(d.sprites ?? []).map((s) => s.group?.trim() || DEFAULT_GROUP)];
  return [...new Set(all)];
};

/** Копия спрайта (встроенного или своего) со свободным ключом, пригодная для добавления в дело. */
export function copyOf(d: CaseFile, src: CustomSprite): CustomSprite {
  const key = uniqueKey(`${src.key}_copy`, (k) => k in SPRITES || !!d.sprites?.some((s) => s.key === k));
  const copy = JSON.parse(JSON.stringify(src)) as CustomSprite;
  return { ...copy, key, name: `${src.name} (копия)`, group: src.group === DEFAULT_GROUP ? undefined : src.group };
}
