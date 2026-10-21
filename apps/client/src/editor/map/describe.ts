import { SPRITE_NAMES, TILE_NAMES } from "../../game/art";
import { objectEvidenceIds, type CaseFile, type Location as LocationT } from "../../../../../shared/case";
import { actionSummary } from "./actions";
import type { Selection, Tool } from "./types";

/** Подпись под курсором: что за объект и что он делает. */
export function describeHit(h: Selection, loc: LocationT, draft: CaseFile): string {
  if (!h) return "";
  if (h.kind === "start") return "Старт игрока";
  if (h.kind === "zone") {
    const z = loc.zones.find((x) => x.id === h.id)!;
    return `Область «${z.name}» · ${z.actions.length ? z.actions.map((a) => actionSummary(a, draft)).join("; ") : "без действий"}`;
  }
  if (h.kind === "npc") {
    const n = loc.npcs.find((x) => x.id === h.id)!;
    const ch = draft.characters.find((c) => c.id === n.characterId);
    return `${ch?.name ?? n.characterId} · диалог «${n.dialogueId}»`;
  }
  const o = loc.objects.find((x) => x.id === h.id)!;
  const name = o.label || SPRITE_NAMES[o.sprite] || o.sprite;
  if (!o.interaction) return o.onInteract?.length ? `${name} · только эффекты, без окна осмотра` : `${name} · декорация`;
  const ids = objectEvidenceIds(o);
  if (!ids.length) return `${name} → только текст осмотра`;
  return `${name} → ${ids.length === 1 ? `материал «${draft.evidence.find((e) => e.id === ids[0])?.title ?? ids[0]}»` : `материалов: ${ids.length}`}`;
}

/** Подсказка по выбранному инструменту. */
export function toolHint(tool: Tool, sel: Selection, loc: LocationT, draft: CaseFile, npcCharacter: string): string {
  switch (tool.kind) {
    case "select":
      return "";
    case "tile":
      return `Клетка «${TILE_NAMES[tool.ch]}»: ведите с зажатой кнопкой (Shift — прямоугольником)`;
    case "object":
      return `Предмет «${SPRITE_NAMES[tool.sprite] ?? tool.sprite}»: кликните, куда поставить`;
    case "npc":
      return `Человек «${draft.characters.find((c) => c.id === npcCharacter)?.name ?? ""}»: кликните, куда поставить`;
    case "zone":
      return sel?.kind === "zone"
        ? `Область «${loc.zones.find((z) => z.id === sel.id)?.name ?? ""}»: ${tool.erase ? "стирайте клетки" : "ведите с зажатой кнопкой, чтобы дорисовать"} (Shift — прямоугольником, Alt — стереть)`
        : "Область: ведите с зажатой кнопкой — первая клетка создаст новую область (Shift — прямоугольником)";
    case "start":
      return "Старт игрока: кликните по клетке пола";
    default:
      return "Выход: кликните по проёму на краю карты";
  }
}
