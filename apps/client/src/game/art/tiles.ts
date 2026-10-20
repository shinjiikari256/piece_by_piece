import type { Ctx } from "./common";
import { TILES, drawTileKey, type TileNeighbors } from "./tiles/model";

// ---------- Тайлы ----------

/** Символы карты встроенных тайлов → ключи тайлов. */
export const TILE_LEGEND: Record<string, string> = {
  "#": "wall", W: "window", B: "brick", G: "glass", P: "painted_wall", F: "fence",
  ".": "tile", ",": "carpet", _: "parquet", w: "dark_parquet", b: "linoleum", k: "ceramic", m: "marble", r: "runner",
  S: "stairs", Z: "stairs_side", D: "doorway", g: "grass", a: "asphalt", p: "sidewalk",
};
/** Символы встроенных тайлов по проходимости (флаг `solid` в данных тайла). */
const charsWhere = (solid: boolean) => Object.entries(TILE_LEGEND).filter(([, key]) => TILES[key].solid === solid).map(([ch]) => ch);
/** Непроходимые клетки: стены, окна, перегородки, забор. */
export const WALL_TILES = new Set(charsWhere(true));
/** Пол — всё, по чему можно ходить. */
export const FLOOR_TILES = new Set(charsWhere(false));
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

/** Подписи для конструктора. */
export const TILE_NAMES: Record<string, string> = {
  "#": "Стена",
  W: "Окно",
  B: "Кирпич",
  G: "Стекло",
  P: "Крашеная стена",
  F: "Забор",
  ".": "Плитка",
  ",": "Ковролин",
  _: "Паркет",
  w: "Тёмный паркет",
  b: "Линолеум",
  k: "Кафель",
  m: "Мрамор",
  r: "Ковровая дорожка",
  S: "Лестница",
  Z: "Лестница вбок",
  D: "Проём",
  g: "Трава",
  a: "Асфальт",
  p: "Тротуар",
};

/** Деление клеток в палитре редактора карты — по роли: пол и стены (каждая клетка — ровно в одной группе; проверяет тест). */
export const FLOOR_GROUPS: { id: string; label: string; chars: string[] }[] = [
  { id: "floor", label: "Пол", chars: [".", ",", "_", "w", "b", "k", "m", "r", "S", "Z", "D", "g", "a", "p"] },
];
export const WALL_GROUPS: { id: string; label: string; chars: string[] }[] = [
  { id: "walls", label: "Стены", chars: ["#", "B", "P", "W", "G", "F"] },
];

const keyOf = (ch: string | undefined): string | undefined => (ch === undefined ? undefined : (TILE_LEGEND[ch] ?? ch));

export type { TileNeighbors };

/** Нарисовать клетку карты по символу; соседи тоже символы. */
export function drawTile(ctx: Ctx, ch: string, ox: number, oy: number, n: { below?: string; above?: string; left?: string; right?: string }) {
  drawTileKey(ctx, keyOf(ch) ?? "", ox, oy, { below: keyOf(n.below), above: keyOf(n.above), left: keyOf(n.left), right: keyOf(n.right) });
}
