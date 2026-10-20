import { type CaseFile, type Condition, type Effect } from "../../../../shared/case";
import { flagOfEffect, isFlagAction } from "../../../../shared/conditions";
import { effectSites } from "../../../../shared/effect-sites";
import { isRangeOrdered, parseEventTime } from "../../../../shared/events";
import { isEntryTrigger, isInteractive } from "../../../../shared/case";
import { parseCase } from "../../../../shared/migrate";
import { FLOOR_TILES, SPRITES, SPRITE_GROUPS, registerCaseSprites, WALL_TILES, resolveLook, solidCells } from "../game/art";
import { zoneTargetCell } from "./case-utils";
import { findPath } from "../game/scene/navigation";

export type ValidationResult =
  | { ok: true; caseFile: CaseFile }
  | { ok: false; errors: string[] };

const FLOOR = FLOOR_TILES;

/** Структура по схеме + смысловые проверки, которые схема выразить не может. */
export function validateCase(raw: unknown): ValidationResult {
  const parsed = parseCase(raw);
  if (!parsed.success) return { ok: false, errors: parsed.errors };
  registerCaseSprites(parsed.data.sprites);
  const errors = checkIntegrity(parsed.data);
  return errors.length ? { ok: false, errors } : { ok: true, caseFile: parsed.data };
}

function checkIntegrity(c: CaseFile): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);

  // спрайты дела и ссылки на спрайты — раньше всего: дальше проверки читают SPRITES[o.sprite]
  const builtin = new Set(SPRITE_GROUPS.flatMap((g) => Object.keys(g.sprites)));
  const seenSprites = new Set<string>();
  for (const sp of c.sprites ?? []) {
    const W = `sprite ${sp.key}`;
    if (builtin.has(sp.key)) err(`${W}: ключ совпадает со встроенным спрайтом`);
    if (seenSprites.has(sp.key)) err(`${W}: повторяющийся ключ`);
    seenSprites.add(sp.key);
    if (!sp.name.trim()) err(`${W}: не задано название`);
    for (const [fr, ops] of Object.entries(sp.frames))
      for (const [x, y, w, h] of ops) if (x < 0 || y < 0 || x + w > sp.w || y + h > sp.h) err(`${W}: кадр ${fr}: прямоугольник выходит за размер ${sp.w}×${sp.h}`);
    for (const cell of sp.cells ?? [])
      if (cell.dx < 0 || cell.dx >= sp.footprint.w || cell.dy < 0 || cell.dy >= sp.footprint.h) err(`${W}: клетка ${cell.dx},${cell.dy} вне опоры`);
  }
  let badSprite = false;
  for (const l of c.locations)
    for (const o of l.objects)
      if (!(o.sprite in SPRITES)) {
        err(`location ${l.id}/object ${o.id}: нет спрайта «${o.sprite}»`);
        badSprite = true;
      }
  if (badSprite) return errors;

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
  const counterIds = unique("counters", (c.counters ?? []).map((x) => x.id));
  (c.flags ?? []).forEach((f) => counterIds.has(f.id) && err(`counters: ключ «${f.id}» занят и флагом, и счётчиком — ключи должны отличаться`));
  (c.counters ?? []).forEach((x) => {
    if (!x.name.trim()) err(`counters: у счётчика «${x.id}» нет названия`);
    if (x.min !== undefined && x.max !== undefined && x.min > x.max) err(`counters: у счётчика «${x.id}» наименьшее значение больше наибольшего`);
    if (x.initial !== undefined && ((x.min !== undefined && x.initial < x.min) || (x.max !== undefined && x.initial > x.max))) err(`counters: начальное значение счётчика «${x.id}» вне его границ`);
  });
  const enumIds = unique("enums", (c.enums ?? []).map((x) => x.id));
  (c.flags ?? []).forEach((f) => enumIds.has(f.id) && err(`enums: ключ «${f.id}» занят и флагом, и перечислением — ключи должны отличаться`));
  (c.counters ?? []).forEach((x) => enumIds.has(x.id) && err(`enums: ключ «${x.id}» занят и счётчиком, и перечислением — ключи должны отличаться`));
  const enumValues = new Map<string, Set<string>>();
  for (const e of c.enums ?? []) {
    if (!e.name.trim()) err(`enums: у перечисления «${e.id}» нет названия`);
    if (!e.values.length) err(`enums: у перечисления «${e.id}» нет значений`);
    enumValues.set(e.id, unique(`enums ${e.id} values`, e.values.map((x) => x.id)));
    e.values.forEach((x) => x.name.trim() || err(`enums: у значения «${x.id}» перечисления «${e.id}» нет названия`));
    if (e.initial !== undefined && !e.values.some((x) => x.id === e.initial)) err(`enums: начальное значение «${e.initial}» перечисления «${e.id}» не из списка значений`);
  }
  const evidence = unique("evidence", c.evidence.map((x) => x.id));
  const itemIds = new Set(c.evidence.filter((x) => x.kind === "item").map((x) => x.id));
  const events = unique("events", c.events.map((x) => x.id));
  const dialogues = unique("dialogues", c.dialogues.map((x) => x.id));
  const deductions = unique("deductions", c.deductions.map((x) => x.id));
  const locationIds = unique("locations", c.locations.map((l) => l.id));
  if (!c.locations.length) err("locations: нужна хотя бы одна локация");
  const starts = c.locations.filter((l) => l.playerStart).length;
  if (starts !== 1) err(`locations: клетка старта игрока должна быть ровно одна (сейчас ${starts})`);
  unique("location objects/npcs", c.locations.flatMap((l) => [...l.objects.map((o) => o.id), ...l.npcs.map((n) => n.id)]));
  unique("npcs (персонаж в двух местах)", c.locations.flatMap((l) => l.npcs.map((n) => n.characterId)));
  unique("questions", c.questions.map((q) => q.id));
  unique("zones", c.locations.flatMap((l) => l.zones.map((z) => z.id)));

  const ref = (set: Set<string>, id: string, where: string) => {
    if (!set.has(id)) err(`${where}: неизвестная ссылка «${id}»`);
  };
  const checkCondition = (cond: Condition | undefined, where: string): void => {
    cond?.evidence?.forEach((id) => ref(evidence, id, where));
    cond?.notEvidence?.forEach((id) => ref(evidence, id, where));
    cond?.deductions?.forEach((id) => ref(deductions, id, where));
    cond?.notDeductions?.forEach((id) => ref(deductions, id, where));
    cond?.following?.forEach((id) => ref(characters, id, where));
    cond?.notFollowing?.forEach((id) => ref(characters, id, where));
    cond?.inLocation?.forEach((id) => ref(locationIds, id, where));
    cond?.notInLocation?.forEach((id) => ref(locationIds, id, where));
    cond?.chosen?.forEach((r) => {
      const choice = c.dialogues.find((d) => d.id === r.dialogueId)?.nodes.find((n) => n.id === r.nodeId)?.choices.find((ch) => ch.id === r.choiceId);
      if (!choice) err(`${where}: вариант ответа «${r.dialogueId}/${r.nodeId}/${r.choiceId}» не найден`);
    });
    cond?.counters?.forEach((r) => {
      ref(counterIds, r.counterId, where);
      if (r.min !== undefined && r.max !== undefined && r.min > r.max) err(`${where}: счётчик «${r.counterId}» — «от» больше «до»`);
    });
    cond?.enums?.forEach((r) => {
      ref(enumIds, r.enumId, where);
      [...(r.in ?? []), ...(r.notIn ?? [])].forEach((id) => {
        if (enumValues.has(r.enumId) && !enumValues.get(r.enumId)!.has(id)) err(`${where}: у перечисления «${r.enumId}» нет значения «${id}»`);
      });
    });
    cond?.anyOf?.forEach((alt) => checkCondition(alt, where));
    cond?.allOf?.forEach((part) => checkCondition(part, where));
  };
  const checkEffects = (effects: Effect[], where: string) => {
    for (const e of effects) {
      checkCondition(e.requires, `${where}: условие эффекта`);
      if (e.type === "removeEvidence") {
        ref(evidence, e.evidenceId, where);
        // улика, на которой строится сопоставление, из дела не убирается: его нельзя было бы решить
        const used = c.deductions.find((d) => d.evidenceIds.includes(e.evidenceId));
        if (used) err(`${where}: улику «${e.evidenceId}» нельзя убрать — на ней строится сопоставление «${used.id}»`);
      }
      if (e.type === "startDialogue") ref(dialogues, e.dialogueId, where);
      if (e.type === "travel") {
        if (!locationIds.has(e.locationId)) err(`${where}: перенос игрока — неизвестная локация «${e.locationId}»`);
        else if (!floorOf.get(e.locationId)?.(e.x, e.y)) err(`${where}: перенос игрока — клетка ${e.x},${e.y} в «${e.locationId}» не пол`);
      }
      if (e.type === "playAnimation") {
        const obj = c.locations.flatMap((l) => l.objects).find((o) => o.id === e.objectId);
        if (!obj) err(`${where}: анимация — неизвестный предмет «${e.objectId}»`);
        else
          e.clip.forEach((step) => {
            if (!(step.frame in SPRITES[obj.sprite].frames)) err(`${where}: у спрайта «${obj.sprite}» нет кадра «${step.frame}»`);
          });
      }
      if (e.type === "message" && !e.text.trim()) err(`${where}: у сообщения нет текста`);
      if (e.type === "addEvidence") ref(evidence, e.evidenceId, where);
      if (e.type === "changeVariable") {
        if (e.action === "assign") {
          ref(enumIds, e.variableId, where);
          if (!e.valueId) err(`${where}: у перечисления «${e.variableId}» не выбрано значение`);
          else if (enumValues.has(e.variableId) && !enumValues.get(e.variableId)!.has(e.valueId)) err(`${where}: у перечисления «${e.variableId}» нет значения «${e.valueId}»`);
        } else if (isFlagAction(e.action)) {
          if (counterIds.has(e.variableId)) err(`${where}: «${e.variableId}» — счётчик, а действие над флагом`);
          if (enumIds.has(e.variableId)) err(`${where}: «${e.variableId}» — перечисление, а действие над флагом`);
        } else {
          if (enumIds.has(e.variableId)) err(`${where}: «${e.variableId}» — перечисление, а действие над счётчиком`);
          ref(counterIds, e.variableId, where);
          if (e.value === undefined) err(`${where}: у счётчика «${e.variableId}» не указано число`);
        }
      }
      if (e.type === "addCharacterNote" || e.type === "follow" || e.type === "stay" || e.type === "returnHome" || e.type === "moveTo")
        ref(characters, e.characterId, where);
      if (e.type === "moveTo") checkMoveTo(e, where);
    }
  };
  /** `moveTo`: цель — свободный пол существующей локации; в своей локации персонаж должен дойти пешком (двери и выходы — проходимы). */
  const checkMoveTo = (e: Extract<Effect, { type: "moveTo" }>, where: string) => {
    if (!locationIds.has(e.locationId)) return err(`${where}: moveTo — неизвестная локация «${e.locationId}»`);
    const isFloor = floorOf.get(e.locationId)!;
    if (e.zoneId) {
      // цель — область: проверяем клетку, которую игра выберет (первая свободная); запасная x, y не важна
      const loc = c.locations.find((l) => l.id === e.locationId)!;
      const zone = loc.zones.find((z) => z.id === e.zoneId);
      if (!zone) return err(`${where}: moveTo — в «${e.locationId}» нет области «${e.zoneId}»`);
      const picked = zoneTargetCell(loc, zone, e.characterId);
      if (!picked) return err(`${where}: moveTo — в области «${zone.name}» нет свободной клетки`);
      return checkMoveTo({ ...e, zoneId: undefined, x: picked.x, y: picked.y }, where);
    }
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
      for (const c of solidCells(o.x, o.y, spec)) occupy(c.x, c.y, `object ${o.id}`);
      if (o.states?.length) {
        unique(`${L}/object ${o.id}.states`, o.states.map((st) => st.id));
        for (const st of o.states) {
          if (st.frame && !spec.frames[st.frame]) err(`${L}/object ${o.id}: состояние ${st.id}: у спрайта ${o.sprite} нет кадра ${st.frame}`);
          checkCondition(st.when, `${L}/object ${o.id}: состояние ${st.id}.when`);
          st.loop?.clip.forEach((step) => {
            if (!spec.frames[step.frame]) err(`${L}/object ${o.id}: состояние ${st.id}: в цикле нет кадра ${step.frame} у спрайта ${o.sprite}`);
          });
        }
      }
      const stateIds = new Set(["*", "default", ...(o.states ?? []).map((st) => st.id)]);
      const clipCheck = (clip: { frame: string }[], what: string) =>
        clip.forEach((step) => {
          if (!spec.frames[step.frame]) err(`${L}/object ${o.id}: ${what}: нет кадра ${step.frame} у спрайта ${o.sprite}`);
        });
      o.actions?.forEach((a, i) => {
        if (a.state !== undefined && !stateIds.has(a.state)) err(`${L}/object ${o.id}: действие №${i + 1}: нет состояния «${a.state}»`);
        clipCheck(a.clip, `действие №${i + 1}`);
      });
      o.timers?.forEach((t, i) => {
        if (t.state !== undefined && !stateIds.has(t.state)) err(`${L}/object ${o.id}: таймер №${i + 1}: нет состояния «${t.state}»`);
        clipCheck(t.clip, `таймер №${i + 1}`);
      });
      o.transitions?.forEach((t, i) => {
        for (const side of [t.from, t.to]) if (!stateIds.has(side)) err(`${L}/object ${o.id}: переход №${i + 1}: нет состояния «${side}»`);
        if (t.from === t.to && t.from !== "*") err(`${L}/object ${o.id}: переход №${i + 1}: «из» и «в» совпадают`);
        t.clip.forEach((step) => {
          if (!spec.frames[step.frame]) err(`${L}/object ${o.id}: переход №${i + 1}: нет кадра ${step.frame} у спрайта ${o.sprite}`);
        });
      });
    }
    for (const n of loc.npcs) occupy(n.x, n.y, `npc ${n.id}`);
    occupiedOf.set(loc.id, occupied);
    const { playerStart } = loc;
    if (playerStart) {
      if (!isFloor(playerStart.x, playerStart.y)) err(`${L}.playerStart: не на полу`);
      if (occupied.has(`${playerStart.x},${playerStart.y}`)) err(`${L}.playerStart: клетка занята`);
    }

    for (const n of loc.npcs) {
      ref(characters, n.characterId, `npc ${n.id}`);
      ref(dialogues, n.dialogueId, `npc ${n.id}`);
      checkCondition(n.requires, `npc ${n.id}.requires`);
      n.dialogues.forEach((nd, i) => {
        ref(dialogues, nd.dialogueId, `npc ${n.id}: диалог по условию №${i + 1}`);
        checkCondition(nd.requires, `npc ${n.id}: диалог по условию №${i + 1}.requires`);
      });
    }
    for (const z of loc.zones) {
      if (!z.name.trim()) err(`${L}/zone ${z.id}: нет названия`);
      if (z.color && !/^#[0-9a-f]{6}$/i.test(z.color)) err(`${L}/zone ${z.id}: цвет «${z.color}» — нужен вид #rrggbb`);
      if (!z.cells.length) err(`${L}/zone ${z.id}: область пуста — отметьте клетки на карте`);
      for (const cell of z.cells) if (!inBounds(cell.x, cell.y)) err(`${L}/zone ${z.id}: клетка ${cell.x},${cell.y} вне карты`);
      z.actions.forEach((a, i) => {
        const where = `${L}/zone ${z.id}: действие №${i + 1}`;
        checkCondition(a.requires, `${where}.requires`);
        if (a.kind === "dialogue") ref(dialogues, a.dialogueId, `${where} (диалог)`);
        if (a.kind === "exit") ref(locationIds, a.to, `${where} (выход)`);
        if (a.kind === "exit" && a.trigger === "leave") err(`${where} (выход): выход не может срабатывать при выходе из области`);
        if (a.kind === "object") {
          const o = c.locations.flatMap((l) => l.objects).find((x) => x.id === a.objectId);
          if (!o) err(`${where} (предмет): неизвестная ссылка «${a.objectId}»`);
          else if (!isInteractive(o)) err(`${where} (предмет): у «${a.objectId}» нет ни окна осмотра, ни эффектов — это декорация`);
        }
      });
    }
  }
  // выходы (действия `exit` областей): точка появления — пол целевой карты, но не прямо в области с автоматическим выходом (иначе сразу выкинет обратно)
  for (const loc of c.locations) {
    for (const z of loc.zones) {
      z.actions.forEach((a, i) => {
        if (a.kind !== "exit") return;
        const target = c.locations.find((l) => l.id === a.to);
        if (!target) return;
        const where = `location ${loc.id}/zone ${z.id}: действие №${i + 1}`;
        if (!floorOf.get(target.id)?.(a.spawn.x, a.spawn.y)) err(`${where} (выход): spawn не на полу в «${a.to}»`);
        const bounce = target.zones.some((tz) => tz.cells.some((cell) => cell.x === a.spawn.x && cell.y === a.spawn.y) && tz.actions.some((ta) => ta.kind === "exit" && isEntryTrigger(ta.trigger)));
        if (bounce) err(`${where} (выход): spawn стоит в области с автоматическим выходом — игрока сразу выкинет обратно`);
      });
    }
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
      if (!n.choices.length) err(`${where}: нет вариантов ответа`);
      unique(`${where} choices`, n.choices.map((ch) => ch.id));
      for (const ch of n.choices) {
        if (ch.next !== null) ref(nodes, ch.next, `${where}/${ch.id}.next`);
        checkCondition(ch.requires, `${where}/${ch.id}.requires`);
      }
      n.textVariants?.forEach((tv, i) => checkCondition(tv.requires, `${where}.textVariants[${i}].requires`));
    }
  }

  // эффекты: ссылки внутри них и источники улик (реплики, варианты, сопоставления, осмотр, области)
  for (const site of effectSites(c)) {
    checkEffects(site.effects, site.where);
    site.effects.forEach((e) => e.type === "addEvidence" && obtainable.add(e.evidenceId));
  }

  for (const id of evidence) {
    if (!obtainable.has(id)) err(`evidence ${id}: недостижима — нет ни объекта, ни эффекта addEvidence`);
  }

  // Сопоставления
  for (const d of c.deductions) {
    checkCondition(d.requires, `deduction ${d.id}.requires`);
    if (d.requires?.deductions?.includes(d.id)) err(`deduction ${d.id}: условие доступности требует само это сопоставление — оно никогда не станет доступным`);
    // вход — улика или уже установленный факт (так строятся цепочки)
    d.evidenceIds.forEach((id) => {
      if (!evidence.has(id) && !deductions.has(id)) err(`deduction ${d.id}: неизвестная ссылка «${id}»`);
      if (evidence.has(id) && deductions.has(id)) err(`deduction ${d.id}: «${id}» — и улика, и вывод; переименуйте одно из них`);
      if (itemIds.has(id)) err(`deduction ${d.id}: «${id}» — предмет, а не улика; в сопоставление берут улики, показания и выводы`);
    });
    if (d.evidenceIds.length !== 2) err(`deduction ${d.id}: сопоставляются ровно два материала`);
    if (d.evidenceIds.includes(d.id)) err(`deduction ${d.id}: вывод не может опираться сам на себя`);
    if (d.options.filter((o) => o.correct).length !== 1) err(`deduction ${d.id}: должен быть ровно один верный вариант`);
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
  const addFlagOf = (e: Effect) => {
    const f = flagOfEffect(e);
    if (f) usedFlags.add(f.flag);
  };
  const condFlags = (cond?: Condition): void => {
    [...(cond?.flags ?? []), ...(cond?.notFlags ?? [])].forEach((f) => usedFlags.add(f));
    cond?.anyOf?.forEach(condFlags);
    cond?.allOf?.forEach(condFlags);
  };
  for (const dl of c.dialogues)
    for (const n of dl.nodes) {
      n.choices.forEach((ch) => condFlags(ch.requires));
      n.textVariants?.forEach((tv) => condFlags(tv.requires));
    }
  effectSites(c).forEach((site) =>
    site.effects.forEach((e) => {
      addFlagOf(e);
      condFlags(e.requires);
    }),
  );
  c.locations.forEach((l) =>
    l.npcs.forEach((n) => {
      condFlags(n.requires);
      n.dialogues.forEach((nd) => condFlags(nd.requires));
    }),
  );
  c.locations.forEach((l) => l.zones.forEach((z) => z.actions.forEach((a) => condFlags(a.requires))));
  c.locations.forEach((l) => l.objects.forEach((o) => o.states?.forEach((st) => condFlags(st.when))));
  c.events.forEach((ev) => condFlags(ev.requires));
  for (const f of usedFlags) if (!named.has(f)) err(`flags: у флага «${f}» нет названия — добавьте его в разделе «Переменные»`);
  c.lawReference?.basis.forEach((x, i) => x.title.trim() || err(`lawReference: у нормы №${i + 1} нет названия`));
  c.lawReference?.notes.forEach((x, i) => x.title.trim() || err(`lawReference: у пояснения №${i + 1} нет заголовка`));
  const combos = c.deductions.map((d) => [...d.evidenceIds].sort().join("+"));
  unique("deductions (наборы улик)", combos);

  // Подсказки
  const levels = c.hints.map((h) => h.level).sort();
  if (levels.join(",") !== "1,2,3") err("hints: нужны подсказки уровней 1, 2 и 3");
  c.hints.forEach((h) => checkCondition(h.requires, `hint ${h.level}.requires`));

  // События хронологии
  for (const ev of c.events) {
    checkCondition(ev.requires, `event ${ev.id}.requires`);
    if (!parseEventTime(ev.at)) err(`event ${ev.id}: такой даты или времени нет — «${ev.at}»`);
    if (ev.until !== undefined) {
      if (!parseEventTime(ev.until)) err(`event ${ev.id}: такой даты или времени нет — «${ev.until}»`);
      else if (parseEventTime(ev.at) && !isRangeOrdered(ev.at, ev.until)) err(`event ${ev.id}: конец («${ev.until}») раньше начала («${ev.at}»)`);
    }
  }

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
      // предметы (ключ, фонарь) уликами не считаются и в вопросах не участвуют
      ids.forEach((id) => itemIds.has(id) && err(`${where}: «${id}» — предмет, а не улика; убери его из вариантов`));
      evidence.forEach((id) => itemIds.has(id) || ids.includes(id) || err(`${where}: нет варианта для улики «${id}»`));
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
