import { type CaseFile, type Condition, type Effect } from "../../../../shared/case";
import { parseCase } from "../../../../shared/migrate";
import { FLOOR_TILES, SPRITES, WALL_TILES, resolveLook } from "../game/art";
import { findPath } from "../game/scene/navigation";

export type ValidationResult =
  | { ok: true; caseFile: CaseFile }
  | { ok: false; errors: string[] };

const FLOOR = FLOOR_TILES;

/** Структура по схеме + смысловые проверки, которые схема выразить не может. */
export function validateCase(raw: unknown): ValidationResult {
  const parsed = parseCase(raw);
  if (!parsed.success) return { ok: false, errors: parsed.errors };
  const errors = checkIntegrity(parsed.data);
  return errors.length ? { ok: false, errors } : { ok: true, caseFile: parsed.data };
}

function checkIntegrity(c: CaseFile): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);

  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err(`${label}: повторяющийся id «${id}»`);
      seen.add(id);
    }
    return seen;
  };

  const characters = unique("characters", c.characters.map((x) => x.id));
  // одинаковая внешность у двух персонажей сбивает игрока с толку
  const seenLooks = new Map<string, string>();
  for (const ch of c.characters) {
    const key = JSON.stringify(resolveLook(ch));
    const other = seenLooks.get(key);
    if (other) err(`characters: у «${ch.id}» такая же внешность, как у «${other}»`);
    else seenLooks.set(key, ch.id);
  }
  const evidence = unique("evidence", c.evidence.map((x) => x.id));
  const events = unique("events", c.events.map((x) => x.id));
  const dialogues = unique("dialogues", c.dialogues.map((x) => x.id));
  const deductions = unique("deductions", c.deductions.map((x) => x.id));
  const locationIds = unique("locations", c.locations.map((l) => l.id));
  if (!c.locations.length) err("locations: нужна хотя бы одна локация");
  unique("location objects/npcs", c.locations.flatMap((l) => [...l.objects.map((o) => o.id), ...l.npcs.map((n) => n.id)]));
  unique("npcs (персонаж в двух местах)", c.locations.flatMap((l) => l.npcs.map((n) => n.characterId)));
  unique("questions", c.questions.map((q) => q.id));

  const ref = (set: Set<string>, id: string, where: string) => {
    if (!set.has(id)) err(`${where}: неизвестная ссылка «${id}»`);
  };
  const checkCondition = (cond: Condition | undefined, where: string) => {
    cond?.evidence?.forEach((id) => ref(evidence, id, where));
    cond?.deductions?.forEach((id) => ref(deductions, id, where));
    cond?.following?.forEach((id) => ref(characters, id, where));
    cond?.notFollowing?.forEach((id) => ref(characters, id, where));
  };
  const checkEffects = (effects: Effect[], where: string) => {
    for (const e of effects) {
      if (e.type === "addEvidence") ref(evidence, e.evidenceId, where);
      if (e.type === "addCharacterNote" || e.type === "follow" || e.type === "stay" || e.type === "returnHome" || e.type === "moveTo")
        ref(characters, e.characterId, where);
      if (e.type === "moveTo") checkMoveTo(e, where);
    }
  };
  /** `moveTo`: цель — свободный пол существующей локации; в своей локации персонаж должен дойти пешком (двери и выходы — проходимы). */
  const checkMoveTo = (e: Extract<Effect, { type: "moveTo" }>, where: string) => {
    if (!locationIds.has(e.locationId)) return err(`${where}: moveTo — неизвестная локация «${e.locationId}»`);
    const isFloor = floorOf.get(e.locationId)!;
    const cell = `${e.x},${e.y}`;
    if (!isFloor(e.x, e.y)) return err(`${where}: moveTo — клетка ${cell} в «${e.locationId}» не пол`);
    const base = c.locations.flatMap((l) => l.npcs.map((n) => ({ locationId: l.id, ...n }))).find((n) => n.characterId === e.characterId);
    const occupied = occupiedOf.get(e.locationId);
    const own = (x: number, y: number) => base?.locationId === e.locationId && base.x === x && base.y === y;
    const blocked = (x: number, y: number) => !!occupied?.has(`${x},${y}`) && !own(x, y);
    if (blocked(e.x, e.y)) return err(`${where}: moveTo — клетка ${cell} занята (${occupied!.get(cell)})`);
    // достижимость проверяем, только когда персонаж начинает в той же локации (между локациями путь идёт через выходы)
    if (base && base.locationId === e.locationId && !findPath((x, y) => isFloor(x, y) && !blocked(x, y), base, [{ x: e.x, y: e.y }]))
      err(`${where}: moveTo — до клетки ${cell} не дойти от места персонажа «${e.characterId}»`);
  };

  // Карты
  const obtainable = new Set<string>();
  const floorOf = new Map<string, (x: number, y: number) => boolean>();
  const occupiedOf = new Map<string, Map<string, string>>();
  for (const loc of c.locations) {
    const L = `location ${loc.id}`;
    const { tiles } = loc;
    const width = tiles[0]?.length ?? 0;
    if (!tiles.length || !width) err(`${L}.tiles: пустая карта`);
    tiles.forEach((row, y) => {
      if (row.length !== width) err(`${L}.tiles[${y}]: длина ${row.length}, ожидается ${width}`);
      for (const ch of new Set(row)) if (!FLOOR.has(ch) && !WALL_TILES.has(ch)) err(`${L}.tiles[${y}]: неизвестный тайл «${ch}»`);
    });
    const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < tiles.length;
    const isFloor = (x: number, y: number) => inBounds(x, y) && FLOOR.has(tiles[y][x]);
    floorOf.set(loc.id, isFloor);

    for (const o of loc.objects) {
      if (!inBounds(o.x, o.y)) err(`${L}/object ${o.id}: вне карты`);
      if (o.interaction?.type === "evidence") {
        ref(evidence, o.interaction.evidenceId, `object ${o.id}`);
        obtainable.add(o.interaction.evidenceId);
      }
    }
    // Твёрдые объекты и NPC не должны стоять друг на друге и на стенах
    const occupied = new Map<string, string>();
    const occupy = (x: number, y: number, who: string) => {
      const key = `${x},${y}`;
      const other = occupied.get(key);
      if (other) err(`${L}/${who}: клетка ${key} уже занята (${other})`);
      else occupied.set(key, who);
      if (!isFloor(x, y)) err(`${L}/${who}: клетка ${key} — не пол`);
    };
    for (const o of loc.objects) {
      const spec = SPRITES[o.sprite];
      if (spec.solid) for (let i = 0; i < spec.footprint; i++) occupy(o.x + i, o.y, `object ${o.id}`);
    }
    for (const n of loc.npcs) occupy(n.x, n.y, `npc ${n.id}`);
    occupiedOf.set(loc.id, occupied);
    const { playerStart } = loc;
    if (!isFloor(playerStart.x, playerStart.y)) err(`${L}.playerStart: не на полу`);
    if (occupied.has(`${playerStart.x},${playerStart.y}`)) err(`${L}.playerStart: клетка занята`);

    for (const n of loc.npcs) {
      ref(characters, n.characterId, `npc ${n.id}`);
      ref(dialogues, n.dialogueId, `npc ${n.id}`);
    }
    unique(`${L}.doors`, loc.doors.map((d) => d.id));
    for (const d of loc.doors) {
      const tiles = d.orientation === "h" ? [[d.x, d.y], [d.x + 1, d.y]] : [[d.x, d.y], [d.x, d.y + 1]];
      for (const [x, y] of tiles) {
        if (!isFloor(x, y)) err(`${L}/door ${d.id}: клетка ${x},${y} — не проём (дверь ставится в проход)`);
        if (occupied.has(`${x},${y}`)) err(`${L}/door ${d.id}: клетка ${x},${y} занята`);
      }
      checkCondition(d.requires, `${L}/door ${d.id}.requires`);
      if (d.requires && Object.values(d.requires).every((v) => !v?.length))
        err(`${L}/door ${d.id}: дверь закрыта, но условий, при которых она откроется, нет`);
    }
    unique(`${L}.exits`, loc.exits.map((e) => e.id));
    for (const e of loc.exits) {
      if (!isFloor(e.x, e.y)) err(`${L}/exit ${e.id}: выход не на проёме`);
      if (occupied.has(`${e.x},${e.y}`)) err(`${L}/exit ${e.id}: проём занят`);
      ref(locationIds, e.to, `${L}/exit ${e.id}.to`);
    }
  }
  // точки появления проверяем, когда известны все карты
  for (const loc of c.locations) {
    for (const e of loc.exits) {
      const target = c.locations.find((l) => l.id === e.to);
      if (!target) continue;
      if (!floorOf.get(target.id)?.(e.spawn.x, e.spawn.y)) err(`location ${loc.id}/exit ${e.id}: spawn не на полу в «${e.to}»`);
      if (target.exits.some((x) => x.x === e.spawn.x && x.y === e.spawn.y))
        err(`location ${loc.id}/exit ${e.id}: spawn стоит прямо на выходе — игрока сразу выкинет обратно`);
    }
  }

  // Очные ставки
  unique("confrontations", c.confrontations.map((x) => x.id));
  for (const cf of c.confrontations) {
    const where = `confrontation ${cf.id}`;
    if (cf.characters.length < 2) err(`${where}: нужно хотя бы два участника`);
    cf.characters.forEach((id) => ref(characters, id, where));
    ref(dialogues, cf.dialogueId, where);
    checkCondition(cf.requires, `${where}.requires`);
  }

  // Улики
  for (const e of c.evidence)
    e.attachments?.forEach((a, i) => {
      if (a.kind === "link" && !/^https?:\/\//i.test(a.src)) err(`evidence ${e.id}: приложение №${i + 1} — адрес ссылки должен начинаться с http:// или https://`);
    });
  for (const e of c.evidence) {
    e.relatedCharacters.forEach((id) => ref(characters, id, `evidence ${e.id}.relatedCharacters`));
    e.relatedEvents.forEach((id) => ref(events, id, `evidence ${e.id}.relatedEvents`));
  }

  // Диалоги
  for (const d of c.dialogues) {
    ref(characters, d.characterId, `dialogue ${d.id}`);
    const nodes = unique(`dialogue ${d.id} nodes`, d.nodes.map((n) => n.id));
    ref(nodes, d.startNodeId, `dialogue ${d.id}.startNodeId`);
    for (const n of d.nodes) {
      const where = `dialogue ${d.id}/${n.id}`;
      if (n.speaker) ref(characters, n.speaker, `${where}.speaker`);
      checkEffects(n.effects, where);
      n.effects.forEach((e) => e.type === "addEvidence" && obtainable.add(e.evidenceId));
      if (!n.choices.length) err(`${where}: нет вариантов ответа`);
      unique(`${where} choices`, n.choices.map((ch) => ch.id));
      for (const ch of n.choices) {
        if (ch.next !== null) ref(nodes, ch.next, `${where}/${ch.id}.next`);
        checkCondition(ch.requires, `${where}/${ch.id}.requires`);
      }
    }
  }

  for (const id of evidence) {
    if (!obtainable.has(id)) err(`evidence ${id}: недостижима — нет ни объекта, ни эффекта addEvidence`);
  }

  // Сопоставления
  for (const d of c.deductions) {
    // вход — улика или уже установленный факт (так строятся цепочки)
    d.evidenceIds.forEach((id) => {
      if (!evidence.has(id) && !deductions.has(id)) err(`deduction ${d.id}: неизвестная ссылка «${id}»`);
      if (evidence.has(id) && deductions.has(id)) err(`deduction ${d.id}: «${id}» — и улика, и вывод; переименуйте одно из них`);
    });
    if (d.evidenceIds.length !== 2) err(`deduction ${d.id}: сопоставляются ровно два материала`);
    if (d.evidenceIds.includes(d.id)) err(`deduction ${d.id}: вывод не может опираться сам на себя`);
    if (d.options.filter((o) => o.correct).length !== 1) err(`deduction ${d.id}: должен быть ровно один верный вариант`);
    checkEffects(d.effects, `deduction ${d.id}`);
  }
  // цепочки без циклов: факт не может зависеть от себя через другие
  const deps = new Map(c.deductions.map((d) => [d.id, d.evidenceIds.filter((id) => deductions.has(id))]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const cyclic = (deps.get(id) ?? []).some(visit);
    visiting.delete(id);
    done.add(id);
    return cyclic;
  };
  for (const d of c.deductions) if (visit(d.id)) err(`deduction ${d.id}: цепочка сопоставлений замкнута в круг`);
  // у каждого флага — русское название
  const named = unique("flags", (c.flags ?? []).map((f) => f.id));
  const usedFlags = new Set<string>();
  const condFlags = (cond?: Condition) => [...(cond?.flags ?? []), ...(cond?.notFlags ?? [])].forEach((f) => usedFlags.add(f));
  for (const dl of c.dialogues)
    for (const n of dl.nodes) {
      n.effects.forEach((e) => e.type === "setFlag" && usedFlags.add(e.flag));
      n.choices.forEach((ch) => condFlags(ch.requires));
    }
  c.deductions.forEach((x) => x.effects.forEach((e) => e.type === "setFlag" && usedFlags.add(e.flag)));
  c.confrontations.forEach((x) => condFlags(x.requires));
  c.locations.forEach((l) => l.doors.forEach((d) => condFlags(d.requires)));
  for (const f of usedFlags) if (!named.has(f)) err(`flags: у флага «${f}» нет названия — добавьте его в разделе «Флаги»`);
  c.lawReference?.basis.forEach((x, i) => x.title.trim() || err(`lawReference: у нормы №${i + 1} нет названия`));
  c.lawReference?.notes.forEach((x, i) => x.title.trim() || err(`lawReference: у пояснения №${i + 1} нет заголовка`));
  const combos = c.deductions.map((d) => [...d.evidenceIds].sort().join("+"));
  unique("deductions (наборы улик)", combos);

  // Подсказки
  const levels = c.hints.map((h) => h.level).sort();
  if (levels.join(",") !== "1,2,3") err("hints: нужны подсказки уровней 1, 2 и 3");

  // Вопросы и баллы
  let total = 0;
  for (const q of c.questions) {
    const where = `question ${q.id}`;
    const ids = q.options.map((o) => o.id);
    if (q.source === "characters") {
      ids.forEach((id) => ref(characters, id, where));
      characters.forEach((id) => ids.includes(id) || err(`${where}: нет варианта для персонажа «${id}»`));
    }
    if (q.source === "evidence") {
      ids.forEach((id) => ref(evidence, id, where));
      evidence.forEach((id) => ids.includes(id) || err(`${where}: нет варианта для улики «${id}»`));
    }
    const best =
      q.kind === "multi"
        ? q.options.reduce((s, o) => s + Math.max(0, o.points), 0)
        : Math.max(...q.options.map((o) => o.points));
    if (best !== q.maxPoints) err(`${where}: максимум по вариантам ${best}, а maxPoints ${q.maxPoints}`);
    total += q.maxPoints;
  }
  if (total <= 0) err("questions: сумма maxPoints должна быть больше нуля");
  if (c.timeBonus?.minScore != null && c.timeBonus.minScore > total)
    err(`timeBonus: порог ${c.timeBonus.minScore} баллов больше максимума ${total} — бонус недостижим`);
  for (const cat of ["right", "violation", "qualification", "responsible", "evidence"] as const) {
    if (!c.questions.some((q) => q.category === cat)) err(`questions: нет вопроса категории «${cat}»`);
  }

  // Решение
  ref(new Set(c.questions.find((q) => q.category === "right")?.options.map((o) => o.id)), c.solution.right, "solution.right");
  ref(characters, c.solution.responsibleCharacter, "solution.responsibleCharacter");
  c.solution.keyEvidence.forEach((k) => ref(evidence, k.evidenceId, "solution.keyEvidence"));
  if (!c.solution.sources.length) err("solution.sources: источники обязательны");

  return errors;
}
