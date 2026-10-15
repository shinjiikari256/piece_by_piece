import type { CaseFile, ZoneAction } from "../../../../../shared/case";

/** Подпись действия области для списков и подсказок: «диалог dlg_x», «предмет obj_y», «выход → Холл». */
export function actionSummary(a: ZoneAction, draft: CaseFile): string {
  if (a.kind === "dialogue") return `диалог «${a.dialogueId}»`;
  if (a.kind === "object") return `предмет «${a.objectId}»`;
  if (a.kind === "effects") return `эффекты (${a.effects.length})`;
  return `выход → ${draft.locations.find((l) => l.id === a.to)?.name ?? a.to}`;
}

/** Откуда запускается диалог: люди на карте (основной диалог или диалог по условию) и области с действием «диалог». */
export function dialogueLinks(draft: CaseFile, dialogueId: string): { people: string[]; zones: string[] } {
  const name = (id: string) => draft.characters.find((c) => c.id === id)?.name ?? id;
  const people = new Set<string>();
  const zones = new Set<string>();
  for (const l of draft.locations) {
    for (const n of l.npcs) if (n.dialogueId === dialogueId || n.dialogues.some((d) => d.dialogueId === dialogueId)) people.add(name(n.characterId));
    for (const z of l.zones) if (z.actions.some((a) => a.kind === "dialogue" && a.dialogueId === dialogueId)) zones.add(z.name);
  }
  return { people: [...people], zones: [...zones] };
}
