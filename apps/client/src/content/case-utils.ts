import type { Location, LocationObject, NpcPlacement } from "../../../../shared/case";
import { FLOOR_TILES } from "../game/art";
import type { PublicCase } from "../../../../shared/public-case";

/** Удобные выборки по делу с несколькими локациями. */

/** Стартовая локация — та, где стоит клетка старта (она одна на дело). */
export const startLocation = (c: PublicCase): Location => c.locations.find((l) => l.playerStart) ?? c.locations[0];

/** Первая клетка пола — запасная точка там, где старта нет (в локациях, куда входят через выходы). */
export function firstFloorCell(loc: Location): { x: number; y: number } {
  for (let y = 0; y < loc.tiles.length; y++)
    for (let x = 0; x < loc.tiles[y].length; x++) if (FLOOR_TILES.has(loc.tiles[y][x])) return { x, y };
  return { x: 0, y: 0 };
}

export const getLocation = (c: PublicCase, id: string): Location =>
  c.locations.find((l) => l.id === id) ?? startLocation(c);

export const allObjects = (c: PublicCase): LocationObject[] => c.locations.flatMap((l) => l.objects);

export const findObject = (c: PublicCase, id: string): LocationObject | undefined =>
  allObjects(c).find((o) => o.id === id);

export const allNpcs = (c: PublicCase): (NpcPlacement & { locationId: string })[] =>
  c.locations.flatMap((l) => l.npcs.map((n) => ({ ...n, locationId: l.id })));

export const npcOfCharacter = (c: PublicCase, characterId: string) =>
  allNpcs(c).find((n) => n.characterId === characterId);

export interface EvidenceSource {
  text: string;
  /** Если источник — персонаж: для портрета. */
  characterId?: string;
}

/** Источник улики: предмет, при осмотре которого она находится, или персонаж, в чьём диалоге она появляется. */
export function sourceOf(c: PublicCase, evidenceId: string): EvidenceSource | null {
  const obj = allObjects(c).find((o) => o.interaction?.evidenceId === evidenceId);
  if (obj) return { text: obj.label || obj.interaction!.title };
  for (const d of c.dialogues) {
    const node = d.nodes.find((n) => n.effects.some((ef) => ef.type === "addEvidence" && ef.evidenceId === evidenceId));
    if (!node) continue;
    const who = c.characters.find((ch) => ch.id === (node.speaker ?? d.characterId));
    if (who) return { text: who.name, characterId: who.id };
  }
  return null;
}
