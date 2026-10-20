import { BASE_TILE, noise, rect, type Ctx } from "./common";

// ---------- Тайлы ----------

/** Непроходимые клетки: стены, окна, перегородки, забор. */
export const WALL_TILES = new Set(["#", "W", "B", "G", "P", "F"]);
/** Пол — всё, по чему можно ходить. */
export const FLOOR_TILES = new Set([".", ",", "_", "D", "g", "a", "p", "m", "b", "k", "r", "w", "S", "Z"]);
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

const isWall = (ch: string | undefined) => !!ch && WALL_TILES.has(ch);

export interface TileNeighbors {
  below?: string;
  above?: string;
  left?: string;
  right?: string;
}

export function drawTile(ctx: Ctx, ch: string, ox: number, oy: number, n: TileNeighbors) {
  const T = BASE_TILE;
  const below = n.below;
  switch (ch) {
    case "#":
    case "W": {
      rect(ctx, ox, oy, T, T, "#cdb892");
      rect(ctx, ox, oy, T, 2, "#e4d6b8");
      // плинтус, если под стеной пол
      if (below && !isWall(below)) {
        rect(ctx, ox, oy + T - 4, T, 4, "#8f7a57");
        rect(ctx, ox, oy + T - 4, T, 1, "#a8916a");
      }
      if (ch === "W") {
        rect(ctx, ox + 2, oy + 2, T - 4, T - 7, "#f4f1ea");
        rect(ctx, ox + 3, oy + 3, T - 6, T - 9, "#9fd3e8");
        rect(ctx, ox + 4, oy + 4, 2, 3, "#d6f0fa");
        rect(ctx, ox + T / 2 - 1, oy + 3, 1, T - 9, "#f4f1ea");
      }
      break;
    }
    case ".": {
      const even = ((ox + oy) / T) % 2 === 0;
      rect(ctx, ox, oy, T, T, even ? "#d3d9dc" : "#c6cdd1");
      rect(ctx, ox, oy, T, 1, "#e0e5e7");
      break;
    }
    case ",": {
      rect(ctx, ox, oy, T, T, "#7f9c8a");
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const n = noise(ox + x, oy + y);
          if (n > 0.86) rect(ctx, ox + x, oy + y, 1, 1, "#8daa98");
          else if (n < 0.08) rect(ctx, ox + x, oy + y, 1, 1, "#718d7c");
        }
      break;
    }
    case "_": {
      rect(ctx, ox, oy, T, T, "#c4925a");
      const shift = (oy / T) % 2 === 0 ? 0 : 8;
      for (let y = 0; y < T; y += 4) {
        rect(ctx, ox, oy + y, T, 1, "#a87a45");
        rect(ctx, ox + ((shift + y * 2) % T), oy + y, 1, 4, "#a87a45");
      }
      rect(ctx, ox + 3, oy + 2, 5, 1, "#d2a46d");
      break;
    }
    case "B": {
      // кирпичная кладка
      rect(ctx, ox, oy, T, T, "#a0523c");
      for (let y = 0; y < T; y += 4) {
        rect(ctx, ox, oy + y, T, 1, "#d8c4a8");
        const shift = (y / 4) % 2 === 0 ? 0 : 4;
        for (let x = shift; x < T; x += 8) rect(ctx, ox + x, oy + y, 1, 4, "#d8c4a8");
      }
      rect(ctx, ox + 2, oy + 1, 4, 2, "#b5634a");
      if (below && !isWall(below)) rect(ctx, ox, oy + T - 2, T, 2, "rgba(0,0,0,0.25)");
      break;
    }
    case "G": {
      // стеклянная перегородка в алюминиевой раме
      rect(ctx, ox, oy, T, T, "#b9dfee");
      rect(ctx, ox, oy, T, 2, "#8a99a6");
      rect(ctx, ox, oy + T - 3, T, 3, "#8a99a6");
      rect(ctx, ox + T - 1, oy, 1, T, "#8a99a6");
      rect(ctx, ox + 3, oy + 3, 1, 8, "#e9f7fd");
      rect(ctx, ox + 5, oy + 3, 1, 4, "#e9f7fd");
      break;
    }
    case "P": {
      // школьная стена: крашеная панель снизу, побелка сверху
      rect(ctx, ox, oy, T, T, "#e9e4d6");
      rect(ctx, ox, oy + 7, T, T - 7, "#5f8f7a");
      rect(ctx, ox, oy + 7, T, 1, "#4a7262");
      if (below && !isWall(below)) rect(ctx, ox, oy + T - 2, T, 2, "rgba(0,0,0,0.2)");
      break;
    }
    case "F": {
      // забор поверх травы
      drawTile(ctx, "g", ox, oy, {});
      rect(ctx, ox, oy + 5, T, 2, "#7a5432");
      rect(ctx, ox, oy + 11, T, 2, "#7a5432");
      for (const x of [1, 6, 11]) {
        rect(ctx, ox + x, oy + 2, 3, 13, "#a8743f");
        rect(ctx, ox + x, oy + 2, 3, 1, "#c8925a");
      }
      break;
    }
    case "g": {
      rect(ctx, ox, oy, T, T, "#6fa84f");
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const n = noise(ox + x, oy + y);
          if (n > 0.9) rect(ctx, ox + x, oy + y, 1, 2, "#8cc46a");
          else if (n < 0.07) rect(ctx, ox + x, oy + y, 1, 1, "#5a8f3e");
        }
      if (noise(ox, oy) > 0.85) rect(ctx, ox + 6, oy + 7, 2, 2, "#f6d55c");
      break;
    }
    case "a": {
      rect(ctx, ox, oy, T, T, "#5d636b");
      for (let y = 0; y < T; y += 2)
        for (let x = 0; x < T; x += 2) if (noise(ox + x, oy + y) > 0.8) rect(ctx, ox + x, oy + y, 1, 1, "#6e757e");
      break;
    }
    case "p": {
      rect(ctx, ox, oy, T, T, "#b8b2a6");
      rect(ctx, ox, oy, T, 1, "#9a9488");
      rect(ctx, ox, oy + 8, T, 1, "#9a9488");
      rect(ctx, ox, oy, 1, 8, "#9a9488");
      rect(ctx, ox + 8, oy + 8, 1, 8, "#9a9488");
      break;
    }
    case "m": {
      rect(ctx, ox, oy, T, T, "#ece8e1");
      rect(ctx, ox, oy, T, 1, "#d6d0c6");
      rect(ctx, ox, oy, 1, T, "#d6d0c6");
      rect(ctx, ox + 3, oy + 4, 6, 1, "#d9d3ca");
      rect(ctx, ox + 8, oy + 5, 4, 1, "#d9d3ca");
      rect(ctx, ox + 5, oy + 11, 7, 1, "#e0dbd2");
      break;
    }
    case "b": {
      rect(ctx, ox, oy, T, T, "#7d97b5");
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) if (noise(ox + x, oy + y) > 0.92) rect(ctx, ox + x, oy + y, 1, 1, "#90a8c4");
      break;
    }
    case "k": {
      rect(ctx, ox, oy, T, T, "#f2f4f5");
      for (let i = 0; i < T; i += 4) {
        rect(ctx, ox + i, oy, 1, T, "#cfd6db");
        rect(ctx, ox, oy + i, T, 1, "#cfd6db");
      }
      break;
    }
    case "r": {
      rect(ctx, ox, oy, T, T, "#a8433a");
      rect(ctx, ox, oy, T, 1, "#e0b23c");
      rect(ctx, ox, oy + T - 1, T, 1, "#e0b23c");
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) if (noise(ox + x, oy + y) > 0.9) rect(ctx, ox + x, oy + y, 1, 1, "#b8524a");
      break;
    }
    case "w": {
      rect(ctx, ox, oy, T, T, "#7a4f2c");
      const shift = (oy / T) % 2 === 0 ? 0 : 8;
      for (let y = 0; y < T; y += 4) {
        rect(ctx, ox, oy + y, T, 1, "#5e3b1f");
        rect(ctx, ox + ((shift + y * 2) % T), oy + y, 1, 4, "#5e3b1f");
      }
      rect(ctx, ox + 3, oy + 2, 5, 1, "#8f6038");
      break;
    }
    case "S": {
      // ступени: светлая проступь, тёмный подступенок
      for (let y = 0; y < T; y += 4) {
        rect(ctx, ox, oy + y, T, 3, "#c9c3b6");
        rect(ctx, ox, oy + y + 3, T, 1, "#8a8478");
      }
      rect(ctx, ox, oy, 1, T, "#6e695f");
      rect(ctx, ox + T - 1, oy, 1, T, "#6e695f");
      break;
    }
    case "Z": {
      // лестница вбок — для проёма в боковой стене (2 клетки по вертикали): проступи — вертикальные полосы, поднимается к краю карты или стене
      const rising = n.right === undefined || isWall(n.right) ? 1 : -1;
      for (let x = 0; x < T; x += 4) {
        rect(ctx, ox + x + (rising > 0 ? 0 : 1), oy, 3, T, "#c9c3b6");
        rect(ctx, ox + x + (rising > 0 ? 3 : 0), oy, 1, T, "#8a8478");
      }
      rect(ctx, ox, oy, T, 1, "#6e695f");
      rect(ctx, ox, oy + T - 1, T, 1, "#6e695f");
      break;
    }
    case "D": {
      // открытый проём: пол коридора продолжается, по краям — косяки
      const floor = below && !isWall(below) && below !== "D" ? below : ".";
      drawTile(ctx, floor, ox, oy, {});
      rect(ctx, ox, oy, T, 3, "rgba(0,0,0,0.18)");
      if (isWall(n.left)) {
        rect(ctx, ox, oy, 3, T, "#6b4a2b");
        rect(ctx, ox + 1, oy, 1, T, "#8f6a40");
      }
      if (isWall(n.right)) {
        rect(ctx, ox + T - 3, oy, 3, T, "#6b4a2b");
        rect(ctx, ox + T - 2, oy, 1, T, "#8f6a40");
      }
      break;
    }
  }
}
