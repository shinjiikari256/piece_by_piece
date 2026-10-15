import type { CaseFile } from "../../../../shared/case";
import type { Focus } from "./state";

/** Куда вести автора по id элемента дела (двойной клик по чипу, «Перейти к»). */
export function refTarget(d: CaseFile, id: string): Focus | null {
  if (d.characters.some((c) => c.id === id)) return { section: "characters", id };
  if (d.evidence.some((e) => e.id === id)) return { section: "evidence", id };
  if (d.deductions.some((x) => x.id === id)) return { section: "deductions", id };
  if (d.events.some((e) => e.id === id)) return { section: "events", id };
  if (d.dialogues.some((x) => x.id === id)) return { section: "dialogues", id };
  if (d.locations.some((l) => l.id === id)) return { section: "locations", sub: id };
  return null;
}
