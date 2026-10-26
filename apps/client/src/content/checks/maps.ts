import { isEntryTrigger, isInteractive } from "../../../../../shared/case";
import { FLOOR_TILES, SPRITES, WALL_TILES, solidCells } from "../../game/art";
import type { Ctx } from "./context";

const FLOOR = FLOOR_TILES;

/** Карты: размеры, проходимость, предметы, люди, области. */
export function checkMaps(ctx: Ctx) {
  const { c, err, unique, ref, characters, dialogues, locationIds, floorOf, occupiedOf, checkCondition } = ctx;
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
        unique(
          `${L}/object ${o.id}.states`,
          o.states.map((st) => st.id),
        );
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
}

/** Выходы (действия `exit` областей): точка появления — пол целевой карты, но не прямо в области с автоматическим выходом. */
export function checkExits(ctx: Ctx) {
  const { c, err, floorOf } = ctx;
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

}
