import type { Ctx } from "./common";
import { TILES, drawTileKey, type TileNeighbors } from "./tiles/model";

// ---------- Тайлы ----------

/** Символы карты встроенных тайлов → ключи тайлов. */
export const DEFAULT_TILE_LEGEND: Readonly<Record<string, string>> = {
  "#": "wall", W: "window", B: "brick", G: "glass", P: "painted_wall", F: "fence",
  ".": "tile", ",": "carpet", _: "parquet", w: "dark_parquet", b: "linoleum", k: "ceramic", m: "marble", r: "runner",
  S: "stairs", Z: "stairs_side", D: "doorway", g: "grass", a: "asphalt", p: "sidewalk",
};
/** Легенда текущего дела: символ карты → ключ тайла (меняется на месте при `registerCaseTiles`). */
export const TILE_LEGEND: Record<string, string> = { ...DEFAULT_TILE_LEGEND };
/** Непроходимые клетки (флаг `solid` тайла): стены, окна, перегородки, забор. Меняется на месте. */
export const WALL_TILES = new Set<string>();
/** Пол — всё, по чему можно ходить. Меняется на месте. */
export const FLOOR_TILES = new Set<string>();
/** Названия предметов для конструктора. */
export const SPRITE_NAMES: Record<string, string> = {
  door_h: "Дверь ─ (в горизонтальной стене)",
  door_v: "Дверь │ (в вертикальной стене)",
  desk: "Стол",
  computer_desk: "Стол с компьютером",
  board: "Доска объявлений",
  cabinet: "Шкаф с ящиками",
  door: "Дверь (рамка)",
  guard_post: "Пост охраны",
  printer: "Принтер",
  chair: "Стул",
  plant: "Растение",
  bench: "Скамья",
  bookshelf: "Книжный шкаф",
  window: "Окно (предмет)",
  water_cooler: "Кулер",
  trash_bin: "Урна",
  bed: "Кровать",
  fridge: "Холодильник",
  sofa: "Диван",
  vending: "Автомат со снеками",
  clock: "Часы (на стену)",
  poster: "Плакат (на стену)",
  coat_rack: "Вешалка",
  stove: "Плита",
  rug: "Ковёр",
  floor_lamp: "Торшер",
  lockers: "Шкафчики",
  server_rack: "Серверная стойка",
  cctv_desk: "Пульт видеонаблюдения",
  whiteboard: "Маркерная доска (на стену)",
  air_conditioner: "Кондиционер (на стену)",
  fire_extinguisher: "Огнетушитель",
  sink: "Раковина",
  kitchen_counter: "Кухонная стойка",
  round_table: "Круглый стол",
  armchair: "Кресло",
  boxes: "Коробки",
  safe: "Сейф",
  coffee_machine: "Кофемашина",
  judge_bench: "Трибуна судьи",
  witness_stand: "Трибуна свидетеля",
  justice_statue: "Фемида (статуя)",
  flag: "Флаг",
  holding_cell: "Решётка камеры",
  shop_shelf: "Стеллаж с товаром",
  cash_register: "Касса",
  bar_counter: "Барная стойка",
  cafe_table: "Столик кафе",
  atm: "Банкомат",
  hospital_bed: "Больничная койка",
  iv_stand: "Капельница",
  street_lamp: "Фонарь",
  tree: "Дерево",
  car: "Машина",
  bus_stop: "Остановка",
  mailbox: "Почтовый ящик",
  desk_papers: "Стол с бумагами",
  desk_corner: "Угловой стол",
  conference_table_3: "Переговорный стол 3×1",
  conference_table_4: "Переговорный стол 4×1",
  coffee_table: "Журнальный столик",
  dining_table: "Обеденный стол",
  kitchen_table: "Кухонный стол",
  school_desk: "Школьная парта",
  lab_table: "Лабораторный стол",
  nightstand: "Прикроватная тумба",
  operating_table: "Операционный стол",
  crate: "Ящик",
  blood_pool: "Лужа крови",
  blood_splatter: "Брызги крови",
  blood_drops: "Кровавая дорожка",
  body_floor: "Тело на полу",
  body_wall: "Тело (вдоль стены)",
  body_covered: "Тело под простынёй",
  chalk_outline: "Контур мелом",
  evidence_tag: "Табличка улики",
  key: "Ключ",
  flashlight: "Фонарик",
  documents: "Документы",
  folder: "Папка",
};

/** Названия обликов для конструктора. */
export const LOOK_NAMES: Record<string, string> = {
  student_f: "Студентка, длинные волосы",
  student_m: "Студент, спортивная кофта",
  student_f2: "Студентка с хвостиком",
  student_m2: "Студент в очках, кудрявый",
  official_m: "Сотрудник в костюме",
  official_m_senior: "Пожилой начальник с усами",
  official_f: "Сотрудница с пучком",
  official_f2: "Сотрудница в красном жакете",
  teacher_f: "Преподавательница в очках",
  teacher_m: "Преподаватель в очках",
  professor_m: "Профессор с бородой",
  guard_m: "Охранник в фуражке",
  casual_m: "Парень в зелёном",
  casual_f: "Девушка в розовом",
  it_m: "Айтишник с бородой",
  cleaner_f: "Уборщица в косынке",
  doctor_f: "Врач в халате",
  elder_f: "Пожилая женщина",
  worker_m: "Рабочий в кепке",
  sport_m: "Спортсмен",
};

/** Подписи клеток для конструктора (по легенде текущего дела; меняется на месте). */
export const TILE_NAMES: Record<string, string> = {};

/** Деление клеток в палитре редактора карты — по роли: пол и стены (каждая клетка — ровно в одной группе). Меняется на месте. */
export const FLOOR_GROUPS: { id: string; label: string; chars: string[] }[] = [{ id: "floor", label: "Пол", chars: [] }];
export const WALL_GROUPS: { id: string; label: string; chars: string[] }[] = [{ id: "walls", label: "Стены", chars: [] }];

/** Пересобрать производные таблицы из легенды `TILE_LEGEND` и тайлов `TILES`. */
export function rebuildTileTables() {
  WALL_TILES.clear();
  FLOOR_TILES.clear();
  for (const k of Object.keys(TILE_NAMES)) delete TILE_NAMES[k];
  FLOOR_GROUPS[0].chars = [];
  WALL_GROUPS[0].chars = [];
  for (const [ch, key] of Object.entries(TILE_LEGEND)) {
    const spec = TILES[key];
    if (!spec) continue;
    TILE_NAMES[ch] = spec.name;
    (spec.solid ? WALL_TILES : FLOOR_TILES).add(ch);
    (spec.solid ? WALL_GROUPS : FLOOR_GROUPS)[0].chars.push(ch);
  }
}
rebuildTileTables();

const keyOf = (ch: string | undefined): string | undefined => (ch === undefined ? undefined : (TILE_LEGEND[ch] ?? ch));

export type { TileNeighbors };

/** Нарисовать клетку карты по символу; соседи тоже символы. */
export function drawTile(ctx: Ctx, ch: string, ox: number, oy: number, n: { below?: string; above?: string; left?: string; right?: string }) {
  drawTileKey(ctx, keyOf(ch) ?? "", ox, oy, { below: keyOf(n.below), above: keyOf(n.above), left: keyOf(n.left), right: keyOf(n.right) });
}
