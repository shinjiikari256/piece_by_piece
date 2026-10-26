import { type CaseFile, type Condition, type Effect } from "../../../../../shared/case";

export type Err = (msg: string) => void;

/** Общие для всех проверок наборы id, ссылки и накопитель ошибок. */
export interface Ctx {
  c: CaseFile;
  err: Err;
  unique(label: string, ids: string[]): Set<string>;
  ref(set: Set<string>, id: string, where: string): void;
  characters: Set<string>;
  counterIds: Set<string>;
  enumIds: Set<string>;
  enumValues: Map<string, Set<string>>;
  evidence: Set<string>;
  itemIds: Set<string>;
  events: Set<string>;
  dialogues: Set<string>;
  deductions: Set<string>;
  locationIds: Set<string>;
  /** Заполняет проверка карт; читают эффекты (перенос игрока, `moveTo`). */
  floorOf: Map<string, (x: number, y: number) => boolean>;
  occupiedOf: Map<string, Map<string, string>>;
  /** Улики, которые можно получить эффектом `addEvidence`. */
  obtainable: Set<string>;
  checkCondition(cond: Condition | undefined, where: string): void;
  checkEffects(effects: Effect[], where: string): void;
}

/** Ctx без проверок условий и эффектов (они строятся поверх — `checks/conditions.ts`). */
export type BaseCtx = Omit<Ctx, "checkCondition" | "checkEffects">;

/** Уникальность id, правила переменных и множества id, на которые ссылаются остальные проверки. */
export function makeContext(c: CaseFile, errors: string[]): BaseCtx {
  const err: Err = (msg) => void errors.push(msg);
  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err(`${label}: повторяющийся id «${id}»`);
      seen.add(id);
    }
    return seen;
  };

  const characters = unique(
    "characters",
    c.characters.map((x) => x.id),
  );
  const counterIds = unique(
    "counters",
    (c.counters ?? []).map((x) => x.id),
  );
  (c.flags ?? []).forEach((f) => counterIds.has(f.id) && err(`counters: ключ «${f.id}» занят и флагом, и счётчиком — ключи должны отличаться`));
  (c.counters ?? []).forEach((x) => {
    if (!x.name.trim()) err(`counters: у счётчика «${x.id}» нет названия`);
    if (x.min !== undefined && x.max !== undefined && x.min > x.max) err(`counters: у счётчика «${x.id}» наименьшее значение больше наибольшего`);
    if (x.initial !== undefined && ((x.min !== undefined && x.initial < x.min) || (x.max !== undefined && x.initial > x.max))) err(`counters: начальное значение счётчика «${x.id}» вне его границ`);
  });
  const enumIds = unique(
    "enums",
    (c.enums ?? []).map((x) => x.id),
  );
  (c.flags ?? []).forEach((f) => enumIds.has(f.id) && err(`enums: ключ «${f.id}» занят и флагом, и перечислением — ключи должны отличаться`));
  (c.counters ?? []).forEach((x) => enumIds.has(x.id) && err(`enums: ключ «${x.id}» занят и счётчиком, и перечислением — ключи должны отличаться`));
  const enumValues = new Map<string, Set<string>>();
  for (const e of c.enums ?? []) {
    if (!e.name.trim()) err(`enums: у перечисления «${e.id}» нет названия`);
    if (!e.values.length) err(`enums: у перечисления «${e.id}» нет значений`);
    enumValues.set(
      e.id,
      unique(
        `enums ${e.id} values`,
        e.values.map((x) => x.id),
      ),
    );
    e.values.forEach((x) => x.name.trim() || err(`enums: у значения «${x.id}» перечисления «${e.id}» нет названия`));
    if (e.initial !== undefined && !e.values.some((x) => x.id === e.initial)) err(`enums: начальное значение «${e.initial}» перечисления «${e.id}» не из списка значений`);
  }
  const evidence = unique(
    "evidence",
    c.evidence.map((x) => x.id),
  );
  const itemIds = new Set(c.evidence.filter((x) => x.kind === "item").map((x) => x.id));
  const events = unique(
    "events",
    c.events.map((x) => x.id),
  );
  const dialogues = unique(
    "dialogues",
    c.dialogues.map((x) => x.id),
  );
  const deductions = unique(
    "deductions",
    c.deductions.map((x) => x.id),
  );
  const locationIds = unique(
    "locations",
    c.locations.map((l) => l.id),
  );
  if (!c.locations.length) err("locations: нужна хотя бы одна локация");
  const starts = c.locations.filter((l) => l.playerStart).length;
  if (starts !== 1) err(`locations: клетка старта игрока должна быть ровно одна (сейчас ${starts})`);
  unique(
    "location objects/npcs",
    c.locations.flatMap((l) => [...l.objects.map((o) => o.id), ...l.npcs.map((n) => n.id)]),
  );
  unique(
    "npcs (персонаж в двух местах)",
    c.locations.flatMap((l) => l.npcs.map((n) => n.characterId)),
  );
  unique(
    "questions",
    c.questions.map((q) => q.id),
  );
  unique(
    "zones",
    c.locations.flatMap((l) => l.zones.map((z) => z.id)),
  );

  const ref = (set: Set<string>, id: string, where: string) => {
    if (!set.has(id)) err(`${where}: неизвестная ссылка «${id}»`);
  };
  return {
    c, err, unique, ref, characters, counterIds, enumIds, enumValues, evidence, itemIds, events, dialogues, deductions, locationIds,
    floorOf: new Map(),
    occupiedOf: new Map(),
    obtainable: new Set(),
  };
}
