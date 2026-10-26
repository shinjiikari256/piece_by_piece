import { type Condition, type Effect } from "../../../../../shared/case";
import { isFlagAction } from "../../../../../shared/conditions";
import { SPRITES } from "../../game/art";
import { findPath } from "../../game/scene/navigation";
import { zoneTargetCell } from "../case-utils";
import type { BaseCtx, Ctx } from "./context";

/** Проверки условий и эффектов: ссылки внутри них. Строятся поверх общего контекста. */
export function makeCheckers(ctx: BaseCtx): Pick<Ctx, "checkCondition" | "checkEffects"> {
  const { c, err, ref, characters, counterIds, enumIds, enumValues, evidence, dialogues, deductions, locationIds, floorOf, occupiedOf } = ctx;
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
      const choice = c.dialogues
        .find((d) => d.id === r.dialogueId)
        ?.nodes.find((n) => n.id === r.nodeId)
        ?.choices.find((ch) => ch.id === r.choiceId);
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
      if (e.type === "addCharacterNote" || e.type === "follow" || e.type === "stay" || e.type === "returnHome" || e.type === "moveTo") ref(characters, e.characterId, where);
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

  return { checkCondition, checkEffects };
}
