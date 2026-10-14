import type { CaseFile } from "../../../../shared/case";
import type { Focus, SectionId } from "./state";

/**
 * Ошибка валидатора → куда вести автора. Валидатор пишет понятные префиксы
 * («dialogue dlg_x/node: …», «evidence e1: …»), их и разбираем.
 */
export interface LocatedError {
  message: string;
  focus: Focus;
  /** Подпись раздела для карточки ошибки. */
  where: string;
}

const SECTION_LABEL: Record<SectionId, string> = {
  general: "Основное",
  characters: "Персонажи",
  locations: "Локации",
  evidence: "Улики",
  events: "События",
  dialogues: "Диалоги",
  confrontations: "Очные ставки",
  deductions: "Сопоставления",
  hints: "Подсказки",
  questions: "Вопросы и баллы",
  solution: "Решение",
  law: "Закон для игрока",
  authorship: "Авторство",
  flags: "Флаги",
  json: "JSON",
  errors: "Ошибки",
};

/** Первые сегменты пути из ошибок схемы (zod): «characters.0.name: …». */
const PATH_SECTION: Record<string, SectionId> = {
  characters: "characters",
  locations: "locations",
  evidence: "evidence",
  events: "events",
  dialogues: "dialogues",
  confrontations: "confrontations",
  deductions: "deductions",
  hints: "hints",
  questions: "questions",
  solution: "solution",
};

export function locateError(message: string, c: CaseFile): LocatedError {
  const make = (section: SectionId, rest: Omit<Focus, "section"> = {}): LocatedError => ({
    message,
    focus: { section, ...rest },
    where: SECTION_LABEL[section],
  });
  const confDialogues = new Set(c.confrontations.map((x) => x.dialogueId));
  let m: RegExpMatchArray | null;

  if ((m = message.match(/^location (\S+?)\/(object|npc|exit|door) (\S+?):/)))
    return make("locations", { sub: m[1], kind: m[2] as Focus["kind"], id: m[3] });
  if ((m = message.match(/^location (\S+?)[/.:]/))) return make("locations", { sub: m[1] });
  if ((m = message.match(/^(object|npc) (\S+?)[:.]/))) {
    const kind = m[1] as "object" | "npc";
    const loc = c.locations.find((l) => (kind === "object" ? l.objects : l.npcs).some((x) => x.id === m![2]));
    return make("locations", { sub: loc?.id, kind, id: m[2] });
  }
  if ((m = message.match(/^dialogue (\S+?)(?:\/(\S+?))?[/.: ]/))) {
    const section: SectionId = confDialogues.has(m[1]) ? "confrontations" : "dialogues";
    const conf = c.confrontations.find((x) => x.dialogueId === m![1]);
    return section === "confrontations" ? make(section, { id: conf?.id, sub: m[2] }) : make(section, { id: m[1], sub: m[2] });
  }
  if ((m = message.match(/^evidence (\S+?)[:.]/))) return make("evidence", { id: m[1] });
  if ((m = message.match(/^deduction (\S+?)[:.]/))) return make("deductions", { id: m[1] });
  if ((m = message.match(/^question (\S+?)[:.]/))) return make("questions", { id: m[1] });
  if ((m = message.match(/^confrontation (\S+?)[:.]/))) return make("confrontations", { id: m[1] });
  if ((m = message.match(/^characters[^«]*«([^»]+)»/))) return make("characters", { id: m[1] });
  if ((m = message.match(/^(\w+)[.:]/)) && PATH_SECTION[m[1]]) return make(PATH_SECTION[m[1]]);
  if (/^hints/.test(message)) return make("hints");
  if (/^questions/.test(message)) return make("questions");
  if (/^solution/.test(message)) return make("solution");
  if (/^lawReference/.test(message)) return make("law");
  if ((m = message.match(/^flags: у флага «([^»]+)»/))) return make("flags", { id: m[1] });
  if (/^flags/.test(message)) return make("flags");
  return make("general");
}
