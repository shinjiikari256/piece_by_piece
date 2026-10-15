import { CaseFile } from "./case";

/**
 * Версии форматов и миграции. Версия хранится в самих данных; нет версии = 1.
 * Миграция `chain[v]` переводит данные версии v в v + 1 и не меняет вход.
 * Новая правка формата, ломающая старые файлы: поднять *_VERSION и дописать звено цепочки.
 */
type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export type Migrated = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export function runMigrations(
  raw: unknown,
  key: string,
  chain: Record<number, Migration>,
  current: number,
  what: string,
): Migrated {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: `${what}: ожидался объект` };
  let data = raw as Record<string, unknown>;
  const given = data[key];
  let version = given === undefined ? 1 : given;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    return { ok: false, error: `${what}: неверная версия формата «${String(given)}»` };
  if (version > current)
    return { ok: false, error: `${what}: версия формата ${version} новее поддерживаемой (${current}) — обновите приложение` };
  while (version < current) {
    const step = chain[version];
    if (!step) return { ok: false, error: `${what}: нет миграции с версии ${version}` };
    data = step(data);
    version++;
  }
  return { ok: true, data: { [key]: current, ...data, ...{ [key]: current } } };
}

// ——— Дело ———

export const CASE_FORMAT_VERSION = 3;

const WALL_CHARS = new Set(["#", "W", "B", "G", "P", "F"]);

type Raw = Record<string, unknown>;

/**
 * 1 → 2: выходы (`Location.exits`) стали областями с действием `exit`; триггер диалога (`Dialogue.trigger`, `requires`)
 * стал действием `dialogue` у области. Область выхода — клетка выхода и её проходимые соседи (по ним подходил игрок).
 */
function caseV1toV2(data: Raw): Raw {
  const locations = ((data.locations as Raw[] | undefined) ?? []).map((raw) => {
    const loc = { ...raw } as Raw;
    const tiles = (loc.tiles as string[] | undefined) ?? [];
    const zones: Raw[] = ((loc.zones as Raw[] | undefined) ?? []).map((z) => ({ ...z, actions: (z.actions as unknown[] | undefined) ?? [] }));
    const taken = new Set(zones.map((z) => z.id as string));
    const floor = (x: number, y: number) => !!tiles[y]?.[x] && !WALL_CHARS.has(tiles[y][x]);
    const exitCells = new Set(((loc.exits as Raw[] | undefined) ?? []).map((e) => `${e.x},${e.y}`));
    for (const exit of ((loc.exits as Raw[] | undefined) ?? [])) {
      const { x, y } = exit as { x: number; y: number };
      // клетка выхода и проходимые соседи, кроме клеток соседних выходов: области одной лестницы не пересекаются
      const cells = [
        { x, y },
        ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter((c) => floor(c.x, c.y) && !exitCells.has(`${c.x},${c.y}`)),
      ];
      const target = ((data.locations as Raw[] | undefined) ?? []).find((l) => l.id === exit.to);
      let id = String(exit.id);
      while (taken.has(id)) id += "_exit";
      taken.add(id);
      zones.push({
        id,
        name: (exit.label as string) || `Выход → ${(target?.name as string) ?? exit.to}`,
        cells,
        actions: [{ kind: "exit", to: exit.to, spawn: exit.spawn }],
      });
    }
    delete loc.exits;
    loc.zones = zones;
    return loc;
  });
  const dialogues = ((data.dialogues as Raw[] | undefined) ?? []).map((raw) => {
    const { trigger, requires, ...dialogue } = raw as Raw & { trigger?: { zoneId: string; auto?: boolean }; requires?: unknown };
    if (trigger) {
      for (const loc of locations) {
        const zone = (loc.zones as Raw[]).find((z) => z.id === trigger.zoneId);
        if (zone) (zone.actions as unknown[]).push({ kind: "dialogue", dialogueId: dialogue.id, ...(requires ? { requires } : {}), ...(trigger.auto ? { auto: true } : {}) });
      }
    }
    return dialogue;
  });
  return { ...data, locations, dialogues };
}

/** Условие «и»: объединяет списки одноимённых полей двух условий. */
function mergeConditions(a: Raw | undefined, b: Raw): Raw {
  const out: Raw = { ...(a ?? {}) };
  for (const [key, list] of Object.entries(b)) out[key] = [...new Set([...((out[key] as unknown[] | undefined) ?? []), ...(list as unknown[])])];
  return out;
}

/**
 * 2 → 3: очные ставки (`confrontations`) стали диалогами персонажей по условию (`NpcPlacement.dialogues`): участнику ставки
 * достаётся диалог с условием «остальные участники идут за игроком» (плюс прежнее условие ставки); диалог по умолчанию — последним.
 */
function caseV2toV3(data: Raw): Raw {
  const confrontations = (data.confrontations as Raw[] | undefined) ?? [];
  const locations = ((data.locations as Raw[] | undefined) ?? []).map((raw) => {
    const loc = { ...raw } as Raw;
    loc.npcs = ((loc.npcs as Raw[] | undefined) ?? []).map((npc) => {
      const own = confrontations
        .filter((cf) => ((cf.characters as string[]) ?? []).includes(npc.characterId as string))
        .map((cf) => {
          const others = ((cf.characters as string[]) ?? []).filter((id) => id !== npc.characterId);
          return { dialogueId: cf.dialogueId, requires: mergeConditions(cf.requires as Raw | undefined, { following: others }) };
        });
      return { ...npc, dialogues: [...own, ...((npc.dialogues as unknown[] | undefined) ?? [])] };
    });
    return loc;
  });
  const { confrontations: _gone, ...rest } = data;
  return { ...rest, locations };
}

/** Звенья цепочки: `caseMigrations[v]` переводит дело версии v в v + 1. */
export const caseMigrations: Record<number, Migration> = { 1: caseV1toV2, 2: caseV2toV3 };

export const migrateCase = (raw: unknown, chain = caseMigrations, current = CASE_FORMAT_VERSION): Migrated =>
  runMigrations(raw, "formatVersion", chain, current, "дело");

/** Разбор дела: миграция до текущего формата, затем схема. Все входы дел (файлы, черновики, импорт) идут через неё. */
export function parseCase(raw: unknown): { success: true; data: CaseFile } | { success: false; errors: string[] } {
  const m = migrateCase(raw);
  if (!m.ok) return { success: false, errors: [m.error] };
  const parsed = CaseFile.safeParse(m.data);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}

// ——— Сохранение расследования (localStorage, поле `v`) ———

export const SAVE_FORMAT_VERSION = 1;
export const saveMigrations: Record<number, Migration> = {};

export const migrateSave = (raw: unknown, chain = saveMigrations, current = SAVE_FORMAT_VERSION): Migrated =>
  runMigrations(raw, "v", chain, current, "сохранение");
