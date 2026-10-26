import { resolveLook } from "../../game/art";
import { type CaseFile } from "../../../../../shared/case";
import { conditionParams } from "../../../../../shared/sprite-bindings";
import { SPRITES, SPRITE_GROUPS, partOf, PART_ROLES, PART_SLOTS, BUILTIN_PARTS, CHAR_W, CHAR_H, TILE_GROUPS, TILES } from "../../game/art";
import type { BaseCtx, Err } from "./context";

/** Спрайты, тайлы, легенда и части персонажей дела: ключи, размеры, ссылки. */
export function checkArtLibrary(c: CaseFile, err: Err) {
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
    for (const cell of sp.cells ?? []) if (cell.dx < 0 || cell.dx >= sp.footprint.w || cell.dy < 0 || cell.dy >= sp.footprint.h) err(`${W}: клетка ${cell.dx},${cell.dy} вне опоры`);
  }
  // тайлы дела и легенда карты
  const builtinTiles = new Set(TILE_GROUPS.flatMap((g) => g.keys));
  const seenTiles = new Set<string>();
  for (const t of c.tiles ?? []) {
    const W = `tile ${t.key}`;
    if (builtinTiles.has(t.key)) err(`${W}: ключ совпадает со встроенным тайлом`);
    if (seenTiles.has(t.key)) err(`${W}: повторяющийся ключ`);
    seenTiles.add(t.key);
    if (!t.name.trim()) err(`${W}: не задано название`);
    if (t.base && !TILES[t.base]) err(`${W}: основа «${t.base}» — нет такого тайла`);
    if (t.base === t.key) err(`${W}: тайл не может быть основой самому себе`);
    const rect = (r: readonly (number | string)[], where: string) => {
      const [x, y, w, h] = r as number[];
      if (x < 0 || y < 0 || x + w > 16 || y + h > 16) err(`${W}: ${where}: прямоугольник выходит за размер 16×16`);
    };
    t.layers.forEach((l, i) => {
      for (const op of l.ops) {
        if (Array.isArray(op)) rect(op, `слой ${i + 1}`);
        else if ("chance" in op) for (const r of op.chance.ops) rect(r, `слой ${i + 1}`);
      }
    });
  }
  for (const [ch, key] of Object.entries(c.legend ?? {})) if (!TILES[key]) err(`legend: символ «${ch}» ведёт на неизвестный тайл «${key}»`);
  // части персонажей дела
  const builtinParts = new Set(PART_SLOTS.flatMap((slot) => BUILTIN_PARTS[slot].map((k) => `${slot}/${k}`)));
  const seenParts = new Set<string>();
  for (const p of c.parts ?? []) {
    const W = `part ${p.slot}/${p.key}`;
    if (builtinParts.has(`${p.slot}/${p.key}`)) err(`${W}: ключ совпадает со встроенной частью`);
    if (seenParts.has(`${p.slot}/${p.key}`)) err(`${W}: повторяющийся ключ`);
    seenParts.add(`${p.slot}/${p.key}`);
    if (!p.name.trim()) err(`${W}: не задано название`);
    for (const [fr, ops] of Object.entries(p.frames))
      for (const [x, y, w, h, col] of ops) {
        if (x < 0 || y < 0 || x + w > CHAR_W || y + h > CHAR_H) err(`${W}: кадр ${fr}: прямоугольник выходит за размер ${CHAR_W}×${CHAR_H}`);
        if (col?.startsWith("$") && !(PART_ROLES as readonly string[]).includes(col)) err(`${W}: кадр ${fr}: неизвестная роль цвета «${col}»`);
      }
  }
  for (const ch of c.characters) {
    const a = ch.appearance;
    if (!a) continue;
    if (!partOf("hair", a.hairStyle)) err(`characters: у «${ch.id}» нет причёски «${a.hairStyle}»`);
    if (!partOf("accent", a.accentStyle)) err(`characters: у «${ch.id}» нет детали одежды «${a.accentStyle}»`);
    if (a.bottom && a.bottom !== "pants" && !partOf("bottom", a.bottom)) err(`characters: у «${ch.id}» нет низа «${a.bottom}»`);
    for (const k of a.faceParts ?? []) if (!partOf("face", k)) err(`characters: у «${ch.id}» нет детали лица «${k}»`);
  }
}

/** Предметы ссылаются на существующие спрайты; `false` — дальше читать их спрайты нельзя. */
export function checkObjectSprites(c: CaseFile, err: Err): boolean {
  let badSprite = false;
  for (const l of c.locations)
    for (const o of l.objects)
      if (!(o.sprite in SPRITES)) {
        err(`location ${l.id}/object ${o.id}: нет спрайта «${o.sprite}»`);
        badSprite = true;
      }
  return !badSprite;
}

/** Переменные и состояния спрайтов дела. */
export function checkSpriteVariables(c: CaseFile, err: Err) {
  // переменные и состояния спрайтов дела
  for (const sp of c.sprites ?? []) {
    const W = `sprite ${sp.key}`;
    const params = new Map((sp.params ?? []).map((q) => [q.id, q]));
    if (params.size !== (sp.params ?? []).length) err(`${W}: повторяющийся id переменной`);
    for (const q of sp.params ?? []) if (q.kind === "enum" && !q.values?.length) err(`${W}: переменная ${q.id} — у перечисления нет значений`);
    const hasFrame = (f: string | undefined) => f === undefined || f in sp.frames;
    const ids = new Set(["*", "default", ...(sp.states ?? []).map((st) => st.id)]);
    if (new Set((sp.states ?? []).map((st) => st.id)).size !== (sp.states ?? []).length) err(`${W}: повторяющийся id состояния`);
    for (const st of sp.states ?? []) {
      const u = conditionParams(st.when);
      for (const k of u.foreign) err(`${W}: состояние ${st.id}: в условии допустимы только переменные спрайта (строка «${k}» нельзя)`);
      for (const id of u.flags) if (params.get(id)?.kind !== "flag") err(`${W}: состояние ${st.id}: «${id}» — не флаг спрайта`);
      for (const id of u.counters) if (params.get(id)?.kind !== "counter") err(`${W}: состояние ${st.id}: «${id}» — не число спрайта`);
      for (const e of u.enums) {
        const q = params.get(e.id);
        if (q?.kind !== "enum") err(`${W}: состояние ${st.id}: «${e.id}» — не перечисление спрайта`);
        else for (const v of e.values) if (!q.values?.some((x) => x.id === v)) err(`${W}: состояние ${st.id}: у «${e.id}» нет значения «${v}»`);
      }
      if (!hasFrame(st.frame)) err(`${W}: состояние ${st.id}: нет кадра ${st.frame}`);
      st.loop?.clip.forEach((x) => hasFrame(x.frame) || err(`${W}: состояние ${st.id}: в цикле нет кадра ${x.frame}`));
    }
    const clips: [string, { frame: string }[]][] = [
      ...(sp.transitions ?? []).map((t, i): [string, { frame: string }[]] => [`переход №${i + 1}`, t.clip]),
      ...(sp.actions ?? []).map((t, i): [string, { frame: string }[]] => [`действие №${i + 1}`, t.clip]),
      ...(sp.timers ?? []).map((t, i): [string, { frame: string }[]] => [`таймер №${i + 1}`, t.clip]),
    ];
    for (const [what, clip] of clips) clip.forEach((x) => hasFrame(x.frame) || err(`${W}: ${what}: нет кадра ${x.frame}`));
    for (const t of sp.transitions ?? []) for (const side of [t.from, t.to]) if (!ids.has(side)) err(`${W}: переход: нет состояния «${side}»`);
  }
}

/** Привязки предметов: переменная спрайта → переменная дела того же вида. */
export function checkBindings(c: CaseFile, err: Err) {
  // привязки предметов: переменная спрайта → переменная дела того же вида
  const spriteByKey = new Map((c.sprites ?? []).map((s) => [s.key, s]));
  for (const l of c.locations)
    for (const o of l.objects) {
      const sp = spriteByKey.get(o.sprite);
      const W = `location ${l.id}/object ${o.id}`;
      if (!sp) {
        if (o.bindings && Object.keys(o.bindings).length) err(`${W}: привязки есть, а у спрайта нет переменных`);
        continue;
      }
      const params = new Map((sp.params ?? []).map((q) => [q.id, q]));
      for (const [pid, target] of Object.entries(o.bindings ?? {})) {
        const q = params.get(pid);
        if (!q) {
          err(`${W}: привязка — у спрайта нет переменной «${pid}»`);
          continue;
        }
        const kindOk =
          q.kind === "flag" ? (c.flags ?? []).some((x) => x.id === target) : q.kind === "counter" ? (c.counters ?? []).some((x) => x.id === target) : (c.enums ?? []).some((x) => x.id === target);
        if (!kindOk) err(`${W}: привязка «${pid}» → «${target}»: нет такой переменной нужного вида`);
        else if (q.kind === "enum") {
          const en = (c.enums ?? []).find((x) => x.id === target)!;
          for (const v of q.values ?? []) if (!en.values.some((x) => x.id === v.id)) err(`${W}: привязка «${pid}» → «${target}»: у перечисления нет значения «${v.id}»`);
        }
      }
      if (!o.states?.length) {
        const used = new Set(
          (sp.states ?? []).flatMap((st) => {
            const u = conditionParams(st.when);
            return [...u.flags, ...u.counters, ...u.enums.map((e) => e.id)];
          }),
        );
        for (const pid of used) if (params.has(pid) && !o.bindings?.[pid]) err(`${W}: переменная спрайта «${pid}» не привязана к переменной дела`);
      }
    }
}

/** Одинаковая внешность у двух персонажей сбивает игрока с толку. */
export function checkLooks(ctx: BaseCtx) {
  const { c, err } = ctx;
  // одинаковая внешность у двух персонажей сбивает игрока с толку
  const seenLooks = new Map<string, string>();
  for (const ch of c.characters) {
    const key = JSON.stringify(resolveLook(ch));
    const other = seenLooks.get(key);
    if (other) err(`characters: у «${ch.id}» такая же внешность, как у «${other}»`);
    else seenLooks.set(key, ch.id);
  }
}
