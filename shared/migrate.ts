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

export const CASE_FORMAT_VERSION = 1;

/** Звенья цепочки: `caseMigrations[v]` переводит дело версии v в v + 1. Пока формат один — цепочка пуста. */
export const caseMigrations: Record<number, Migration> = {};

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
