import type { Effect } from "../../../../../shared/case";
import { ENUM_LABELS } from "../labels";

/** Короткая подпись эффекта для карточек и списков; эффект с условием помечается «если…». */
export function effectLabel(e: Effect): string {
  const text = (() => {
    switch (e.type) {
      case "addEvidence":
        return `улика ${e.evidenceId}`;
      case "changeVariable":
        return e.action === "assign" ? `${e.variableId} = ${e.valueId ?? "?"}` : `${e.variableId}: ${ENUM_LABELS[e.action]}${e.value === undefined ? "" : ` ${e.value}`}`;
      case "message":
        return `сообщение «${e.text.slice(0, 30)}${e.text.length > 30 ? "…" : ""}»`;
      case "addCharacterNote":
        return `заметка о ${e.characterId}`;
      default:
        return `${ENUM_LABELS[e.type]} (${e.characterId})`;
    }
  })();
  return `${text}${e.requires ? " (если…)" : ""}${e.once ? " (1 раз)" : ""}`;
}
