import type { CaseFile, ZoneAction } from "../../../../../shared/case";

/** Подпись действия области для списков и подсказок: «диалог dlg_x», «предмет obj_y», «выход → Холл». */
export function actionSummary(a: ZoneAction, draft: CaseFile): string {
  if (a.kind === "dialogue") return `диалог «${a.dialogueId}»`;
  if (a.kind === "object") return `предмет «${a.objectId}»`;
  return `выход → ${draft.locations.find((l) => l.id === a.to)?.name ?? a.to}`;
}
