import type { CustomPart } from "../../../../../../shared/case";
import { bumpArtVersion } from "../sprites/registry";
import { PARTS, PART_NAMES, PART_SLOTS, type PartSlot, type PartSpec } from "./parts";

/** Части дела, добавленные в `PARTS` сейчас: слот/ключ. */
let custom: { slot: PartSlot; key: string }[] = [];
let lastJson = "[]";

export const partSpecOf = (p: CustomPart): PartSpec => {
  const { key: _k, name: _n, slot: _s, ...rest } = p;
  return rest as unknown as PartSpec;
};

/**
 * Подключить части персонажей текущего дела к общим таблицам `PARTS`/`PART_NAMES` (прежние части дела убираются).
 * Встроенный ключ в том же слоте затереть нельзя. Без изменений набора версия рисунков не растёт.
 */
export function registerCaseParts(list: CustomPart[] | undefined) {
  const json = JSON.stringify(list ?? []);
  if (json === lastJson) return;
  lastJson = json;
  for (const { slot, key } of custom) {
    delete PARTS[slot][key];
    delete PART_NAMES[slot][key];
  }
  custom = [];
  for (const p of list ?? []) {
    if (!PART_SLOTS.includes(p.slot) || p.key in PARTS[p.slot]) continue;
    PARTS[p.slot][p.key] = partSpecOf(p);
    PART_NAMES[p.slot][p.key] = p.name;
    custom.push({ slot: p.slot, key: p.key });
  }
  bumpArtVersion();
}
