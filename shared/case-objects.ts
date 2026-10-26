import { z } from "zod";
import { ClipStep, Condition, Effect } from "./case-logic";

/** Слоты частей персонажа. */
export const PartSlot = z.enum(["hair", "accent", "face", "bottom"]);

/** Окно осмотра предмета: что видит игрок. Улики и прочие эффекты осмотра — отдельно, `LocationObject.onInteract` (эффект «добавить улику в дело»). */
export const ObjectInteraction = z.object({
  title: z.string(),
  description: z.string().describe("Что видно при осмотре"),
});

export const SpriteKey = z.enum([
  "desk",
  "computer_desk",
  "board",
  "cabinet",
  "door",
  "guard_post",
  "printer",
  "chair",
  "plant",
  "bench",
  "bookshelf",
  "window",
  "water_cooler",
  "trash_bin",
  "bed",
  "fridge",
  "sofa",
  "vending",
  "clock",
  "poster",
  "coat_rack",
  "stove",
  "rug",
  "floor_lamp",
  "lockers",
  "server_rack",
  "cctv_desk",
  "whiteboard",
  "fire_extinguisher",
  "sink",
  "kitchen_counter",
  "round_table",
  "armchair",
  "boxes",
  "safe",
  "coffee_machine",
  "air_conditioner",
  "judge_bench",
  "witness_stand",
  "justice_statue",
  "flag",
  "holding_cell",
  "shop_shelf",
  "cash_register",
  "bar_counter",
  "cafe_table",
  "atm",
  "hospital_bed",
  "iv_stand",
  "street_lamp",
  "tree",
  "car",
  "police_car",
  "bus_stop",
  "mailbox",
  "desk_papers",
  "desk_corner",
  "conference_table_3",
  "conference_table_4",
  "coffee_table",
  "dining_table",
  "kitchen_table",
  "school_desk",
  "lab_table",
  "nightstand",
  "operating_table",
  "crate",
  "blood_pool",
  "blood_splatter",
  "blood_drops",
  "body_floor",
  "body_wall",
  "body_covered",
  "chalk_outline",
  "evidence_tag",
  "key",
  "flashlight",
  "documents",
  "folder",
  "door_h",
  "door_v",
]);

/** Цикл состояния: клип идёт по кругу, пока состояние действует. */
export const ObjectLoop = z.object({
  clip: z.array(ClipStep).min(1),
  pauseMs: z.number().int().min(0).max(60000).optional().describe("Пауза между повторами (в это время виден кадр состояния)"),
});

/** Переход между состояниями: клип проигрывается один раз при живой смене `from → to`. */
export const ObjectTransition = z.object({
  from: z.string().describe("Состояние «из» (id), `default` — вид по умолчанию, `*` — любое"),
  to: z.string().describe("Состояние «в» (id), `default` — вид по умолчанию, `*` — любое"),
  clip: z.array(ClipStep).min(1),
});

/** Разовая анимация на событие предмета, без смены состояния (ящик дрогнул при осмотре). */
export const ObjectAction = z.object({
  on: z.enum(["interact"]).default("interact").describe("Событие: осмотр предмета"),
  state: z.string().optional().describe("Только в этом состоянии (id или `default`); без значения — в любом"),
  clip: z.array(ClipStep).min(1),
});

/** Таймерная анимация: раз в `everyMs` (плюс случайная добавка) проигрывается клип поверх состояния. */
export const ObjectTimer = z.object({
  everyMs: z.number().int().min(200).max(600000).describe("Период, мс"),
  jitterMs: z.number().int().min(0).max(600000).optional().describe("Случайная добавка к периоду, мс (от 0 до значения)"),
  state: z.string().optional().describe("Только в этом состоянии (id или `default`); без значения — в любом"),
  clip: z.array(ClipStep).min(1),
});

/** Вид и поведение предмета при условии. Состояние — производная переменных дела: сменить его можно только сменив переменную обычным эффектом. */
export const ObjectState = z.object({
  id: z.string(),
  when: Condition.optional().meta({ always: true }).describe("Когда состояние действует; без условия — подходит всегда (ставьте последним)"),
  frame: z.string().optional().describe("Кадр спрайта; без значения — кадр по умолчанию"),
  solid: z.boolean().optional().describe("Мешает ли проходу в этом состоянии; без значения — как у спрайта"),
  interaction: ObjectInteraction.nullable().optional().describe("Окно осмотра в этом состоянии; без значения — как у предмета, null — без окна"),
  label: z.string().optional().describe("Подпись над предметом в этом состоянии; без значения — как у предмета"),
  onInteract: z.array(Effect).optional().describe("Эффекты осмотра в этом состоянии вместо эффектов предмета (например, сообщение «Заперто»)"),
  onEnter: z.array(Effect).optional().describe("Эффекты в момент, когда предмет перешёл в это состояние (только при смене во время игры, не при загрузке сохранения)"),
  onExit: z.array(Effect).optional().describe("Эффекты в момент, когда предмет вышел из этого состояния"),
  loop: ObjectLoop.optional().describe("Анимация по кругу, пока состояние действует (мигающая лампа)"),
});

/** Своя переменная спрайта: флаг, число или перечисление; условия состояний спрайта ссылаются на неё по `id`. */
export const SpriteParam = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().describe("Название для автора"),
  kind: z.enum(["flag", "counter", "enum"]).describe("Флаг, число или перечисление"),
  values: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .optional()
    .describe("Значения перечисления"),
});

/** Состояние спрайта: только вид (кадр, проходимость, цикл); условие — над переменными спрайта (`flags`, `notFlags`, `counters`, `enums`, `allOf`, `anyOf`). */
export const SpriteState = ObjectState.pick({ id: true, when: true, frame: true, solid: true, loop: true }).extend({
  name: z.string().optional().describe("Название для автора; без него показывается ключ"),
});

const SpriteOp = z.union([
  z.tuple([z.number().int(), z.number().int(), z.number().int().min(1), z.number().int().min(1), z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i)]),
  z.tuple([z.number().int(), z.number().int(), z.number().int().min(1), z.number().int().min(1)]),
]);

/** Спрайт, нарисованный автором дела (встроенные хранятся только ключом): те же поля, что у встроенного, плюс название и группа. */
export const CustomSprite = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .describe("Ключ: латиница, цифры, _; не совпадает со встроенным"),
  name: z.string().describe("Название в палитре"),
  group: z.string().optional().describe("Группа палитры; без значения — «Свои»"),
  w: z.number().int().min(1).max(256).describe("Ширина в пикселях (16 px = тайл)"),
  h: z.number().int().min(1).max(256).describe("Высота в пикселях"),
  footprint: z.object({ w: z.number().int().min(1).max(16), h: z.number().int().min(1).max(16) }).describe("Опора в клетках: вправо и вверх от точки предмета"),
  solid: z.boolean().describe("Мешает ли проходу"),
  cells: z
    .array(z.object({ dx: z.number().int(), dy: z.number().int(), solid: z.boolean() }))
    .optional()
    .describe("Исключения из solid по клеткам опоры"),
  flat: z.boolean().optional(),
  mount: z.number().int().optional(),
  opensNear: z.boolean().optional(),
  mirrorRight: z.boolean().optional(),
  params: z.array(SpriteParam).optional().describe("Свои переменные спрайта: состояния зависят от них, а предмет на карте привязывает их к переменным дела"),
  states: z.array(SpriteState).optional().describe("Состояния по переменным спрайта: действует первое подходящее"),
  transitions: z.array(ObjectTransition).optional().describe("Анимации перехода между состояниями спрайта"),
  actions: z.array(ObjectAction).optional().describe("Анимации на осмотр"),
  timers: z.array(ObjectTimer).optional().describe("Анимации по таймеру"),
  frames: z.record(z.string(), z.array(SpriteOp)).refine((f) => Array.isArray(f.default), "нужен кадр default"),
});

const PartOp = z.union([
  z.tuple([z.number().int(), z.number().int(), z.number().int().min(1), z.number().int().min(1), z.string().regex(/^(#[0-9a-f]{6}([0-9a-f]{2})?|\$[A-Za-z]+)$/)]),
  z.tuple([z.number().int(), z.number().int(), z.number().int().min(1), z.number().int().min(1)]),
]);

/** Часть персонажа, нарисованная автором (причёска, деталь одежды…): рисунок 16×24, цвета — `#rrggbb[aa]` или роли внешности (`$hair`, `$top`…). */
export const CustomPart = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .describe("Ключ: латиница, цифры, _; не совпадает со встроенным в том же слоте"),
  name: z.string().describe("Название в списке частей"),
  slot: PartSlot.describe("Слот: причёска, деталь одежды, лицо, низ"),
  bob: z.boolean().optional().describe("На позе «вдох» сдвигается на пиксель вниз вместе с телом"),
  legs: z.string().optional().describe("Цвет ног под частью (роль или #цвет), например у юбки"),
  frames: z.record(z.string(), z.array(PartOp)).refine((f) => Array.isArray(f.default), "нужен кадр default"),
});

const TileColor = z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
const TileRectOp = z.tuple([z.number().int(), z.number().int(), z.number().int().min(1), z.number().int().min(1), TileColor]);
const TileOp = z.union([
  TileRectOp,
  z.object({ checker: z.tuple([TileColor, TileColor]) }),
  z.object({
    noise: z.object({
      step: z.number().int().min(1),
      rules: z.array(z.object({ gt: z.number().optional(), lt: z.number().optional(), size: z.tuple([z.number().int().min(1), z.number().int().min(1)]), color: TileColor })),
    }),
  }),
  z.object({ chance: z.object({ gt: z.number(), ops: z.array(TileRectOp) }) }),
  z.object({ planks: z.object({ line: TileColor, step: z.number().int().min(1), shiftOdd: z.number().int() }) }),
]);
const TileNeighbor = z.union([z.string(), z.array(z.string())]);

/** Тайл клетки карты, нарисованный автором: рисунок 16×16 слоями (слой может зависеть от соседних клеток). */
export const CustomTile = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .describe("Ключ: латиница, цифры, _; не совпадает со встроенным"),
  name: z.string().describe("Название в палитре карты"),
  solid: z.boolean().describe("Непроходимая клетка (стена, забор)"),
  base: z.string().optional().describe("Тайл, рисуемый под этим (ключ)"),
  baseFrom: z.literal("below").optional().describe("Под тайлом рисуется пол соседа снизу"),
  layers: z.array(
    z.object({
      when: z.object({ above: TileNeighbor.optional(), below: TileNeighbor.optional(), left: TileNeighbor.optional(), right: TileNeighbor.optional() }).optional(),
      ops: z.array(TileOp),
    }),
  ),
});

export const LocationObject = z.object({
  id: z.string(),
  sprite: z.string().describe("Ключ спрайта: встроенный или из спрайтов дела"),
  x: z.number().int().describe("Колонка тайла"),
  y: z.number().int().describe("Строка тайла"),
  label: z.string().describe("Подпись над объектом"),
  interaction: ObjectInteraction.nullable().describe("Окно осмотра; null — без окна (декорация или предмет только с эффектами)"),
  transitions: z.array(ObjectTransition).optional().describe("Анимации перехода между состояниями (открытие двери); нет подходящей — кадр меняется сразу"),
  actions: z.array(ObjectAction).optional().describe("Разовые анимации на осмотр предмета (без смены состояния)"),
  timers: z.array(ObjectTimer).optional().describe("Анимации по таймеру: раз в период проигрывается клип (кот повернул голову)"),
  states: z.array(ObjectState).optional().describe("Состояния по условиям: действует первое подходящее по порядку; нет подходящего — вид по умолчанию"),
  bindings: z.record(z.string(), z.string()).optional().describe("Привязка переменных спрайта к переменным дела: переменная спрайта → переменная дела; действует, если у предмета нет своих состояний"),
  onInteract: z.array(Effect).default([]).meta({ always: true }).describe("Эффекты осмотра предмета (при каждом осмотре; «только один раз» — у самого эффекта); выдача улики — в окне осмотра"),
});

/** Улики, которые может выдать осмотр предмета (эффекты «добавить улику в дело» в `onInteract`, независимо от условий). */
export const objectEvidenceIds = (o: { onInteract?: { type: string; evidenceId?: string }[]; states?: { onInteract?: { type: string; evidenceId?: string }[] }[] }): string[] => [
  ...new Set([...(o.onInteract ?? []), ...(o.states ?? []).flatMap((st) => st.onInteract ?? [])].flatMap((e) => (e.type === "addEvidence" && e.evidenceId ? [e.evidenceId] : []))),
];

/** Предмет, с которым можно взаимодействовать: есть окно осмотра или эффекты. */
export const isInteractive = (o: { interaction?: unknown; onInteract?: unknown[]; states?: { interaction?: unknown; onInteract?: unknown[] }[] }): boolean =>
  !!o.interaction || !!o.onInteract?.length || !!o.states?.some((st) => st.interaction || st.onInteract?.length);

export type LocationObject = z.infer<typeof LocationObject>;
export type ObjectState = z.infer<typeof ObjectState>;
export type SpriteKey = z.infer<typeof SpriteKey>;
export type SpriteParam = z.infer<typeof SpriteParam>;
export type CustomSprite = z.infer<typeof CustomSprite>;
export type CustomPart = z.infer<typeof CustomPart>;
export type CustomTile = z.infer<typeof CustomTile>;
export type PartSlot = z.infer<typeof PartSlot>;
