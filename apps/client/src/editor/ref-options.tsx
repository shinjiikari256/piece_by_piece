import type { ReactNode } from "react";
import { formatEventTime } from "../../../../shared/events";
import type { CaseFile, Dialogue, LocationObject } from "../../../../shared/case";
import { resolveLook } from "../game/art";
import { ArtThumb } from "./Pickers";

export interface FormCtx {
  draft: CaseFile;
  /** Диалог, внутри которого редактируем (для ссылок на узлы). */
  dialogue?: Dialogue;
  /** Предмет, внутри которого редактируем (для выбора кадров спрайта и состояний). */
  object?: Pick<LocationObject, "sprite" | "states">;
}

/** Персонаж в списках и чипах — всегда с портретом. */
export type Option = { value: string; label: string; art?: ReactNode };

export const charOption = (c: CaseFile["characters"][number]): Option => ({
  value: c.id,
  label: c.name,
  art: <ArtThumb kind="look" id={c.look} look={resolveLook(c)} scale={1} />,
});

/** Варианты для полей-ссылок. null — поле не ссылочное. */
export function refOptions(name: string, ctx: FormCtx, isArrayItem: boolean): Option[] | null {
  const d = ctx.draft;
  const chars = () => d.characters.map(charOption);
  const ev = () => d.evidence.map((e) => ({ value: e.id, label: `${e.title} (${e.id})` }));
  switch (name) {
    case "characterId":
    case "speaker":
    case "responsibleCharacter":
    case "relatedCharacters":
    case "following":
    case "notFollowing":
      return chars();
    case "characters":
      return isArrayItem ? chars() : null;
    case "evidenceId":
      return ev();
    case "evidenceIds":
      // в сопоставлении можно брать и установленные факты — цепочкой; предметы (ключ, фонарь) уликами не считаются
      return [...d.evidence.filter((e) => e.kind !== "item").map((e) => ({ value: e.id, label: `${e.title} (${e.id})` })), ...d.deductions.map((x) => ({ value: x.id, label: `Вывод: ${x.title} (${x.id})` }))];
    case "evidence":
    case "notEvidence":
      return isArrayItem ? ev() : null;
    case "notDeductions":
      return isArrayItem ? d.deductions.map((x) => ({ value: x.id, label: `${x.title} (${x.id})` })) : null;
    case "deductions":
      return isArrayItem ? d.deductions.map((x) => ({ value: x.id, label: `${x.title} (${x.id})` })) : null;
    case "relatedEvents":
      return d.events.map((e) => ({ value: e.id, label: `${formatEventTime(e.at, e.until)} — ${e.title}` }));
    case "right":
    case "topic":
      // права — варианты вопроса категории «right» самого дела
      return (d.questions.find((q) => q.category === "right")?.options ?? []).map((o) => ({ value: o.id, label: o.label || o.id }));
    case "dialogueId":
      return d.dialogues.map((x) => ({ value: x.id, label: x.id }));
    case "to":
      return d.locations.map((l) => ({ value: l.id, label: `${l.name} (${l.id})` }));
    case "startNodeId":
    case "next":
      return ctx.dialogue ? ctx.dialogue.nodes.map((n) => ({ value: n.id, label: `${n.id}: ${n.text.slice(0, 40)}` })) : null;
    default:
      return null;
  }
}
