import { z } from "zod";

/**
 * Формат файла дела. Схема — единый источник правды:
 * по ней валидируются JSON-сценарии при загрузке, она же уходит
 * в генератор сценариев как structured output.
 *
 * Схема намеренно без min/max/record: такие ограничения не поддерживаются
 * structured outputs, поэтому смысловые проверки живут в validateCase().
 */

export const Reliability = z.enum(["high", "medium", "low"]);

/** Готовые облики персонажей (рисуются в src/game/art.ts). */
export const Appearance = z.enum([
  "student_f",
  "student_m",
  "official_m",
  "official_m_senior",
  "official_f",
  "teacher_f",
  "teacher_m",
  "guard_m",
  "casual_m",
  "casual_f",
  "student_f2",
  "student_m2",
  "professor_m",
  "official_f2",
  "it_m",
  "cleaner_f",
  "doctor_f",
  "elder_f",
  "worker_m",
  "sport_m",
]);

const conditionRows = {
  evidence: z.array(z.string()).optional().describe("Все эти улики должны быть в журнале"),
  flags: z.array(z.string()).optional().describe("Все эти флаги должны быть установлены"),
  notFlags: z.array(z.string()).optional().describe("Ни один из этих флагов не должен быть установлен"),
  notEvidence: z.array(z.string()).optional().describe("Ни одной из этих улик не должно быть в журнале"),
  deductions: z.array(z.string()).optional().describe("Все эти сопоставления должны быть решены"),
  notDeductions: z.array(z.string()).optional().describe("Ни одно из этих сопоставлений не должно быть решено"),
  following: z.array(z.string()).optional().describe("Эти персонажи идут за игроком"),
  notFollowing: z.array(z.string()).optional().describe("Эти персонажи не идут за игроком"),
  inLocation: z.array(z.string()).optional().describe("Игрок сейчас в одной из этих локаций"),
  notInLocation: z.array(z.string()).optional().describe("Игрок сейчас ни в одной из этих локаций"),
  chosen: z
    .array(z.object({ dialogueId: z.string(), nodeId: z.string(), choiceId: z.string(), not: z.boolean().optional().describe("Вариант ещё не выбирался") }))
    .optional()
    .describe("Варианты ответа, которые игрок уже выбирал (или, с «not», ещё не выбирал)"),
  counters: z
    .array(
      z.object({
        counterId: z.string(),
        min: z.number().int().optional().describe("Значение не меньше"),
        max: z.number().int().optional().describe("Значение не больше"),
      }),
    )
    .optional()
    .describe("Значения счётчиков в заданных границах"),
  enums: z
    .array(
      z.object({
        enumId: z.string(),
        in: z.array(z.string()).optional().describe("Значение — одно из этих"),
        notIn: z.array(z.string()).optional().describe("Значение — не одно из этих"),
      }),
    )
    .optional()
    .describe("Значения перечислений: одно из / не одно из"),
};

/**
 * Условие: строки (все сразу) ∧ каждое из `allOf` ∧ хотя бы одно из `anyOf`. Вложенные условия — тоже условия, глубина не ограничена.
 * Автор собирает его формулой над пронумерованными строками (`1 && (2 || 3)`, см. `shared/condition-formula.ts`).
 */
export type Condition = z.infer<z.ZodObject<typeof conditionRows>> & { anyOf?: Condition[]; allOf?: Condition[] };
export const Condition: z.ZodType<Condition> = z.object({
  ...conditionRows,
  get anyOf() {
    return z.array(Condition).optional().describe("«Или»: должно выполняться хотя бы одно из этих условий; остальные строки условия тоже должны выполняться");
  },
  get allOf() {
    return z.array(Condition).optional().describe("«И»: должны выполняться все эти условия (нужно, когда в «и» стоят несколько групп «или»)");
  },
});

/** Необязательное условие эффекта: проверяется в момент применения, по состоянию после предыдущих эффектов списка. */
const effectWhen = {
  requires: Condition.optional().describe("Применять, только если условие выполнено (проверяется в момент применения)"),
  once: z.boolean().optional().describe("Только один раз за прохождение: после первого срабатывания эффект больше не применяется"),
};

/** Шаг клипа: кадр спрайта и сколько миллисекунд его держать. */
export const ClipStep = z.object({
  frame: z.string().describe("Кадр спрайта"),
  ms: z.number().int().min(10).max(10000).default(100).describe("Сколько миллисекунд показывать кадр"),
});
export type ClipStep = z.infer<typeof ClipStep>;

export const Effect = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addEvidence"), evidenceId: z.string(), ...effectWhen }),
  z
    .object({
      type: z.literal("changeVariable"),
      variableId: z.string(),
      action: z.enum(["on", "off", "toggle", "add", "subtract", "set", "assign"]),
      value: z.number().int().optional().describe("Число для счётчика (прибавить, отнять, задать); для флага и перечисления не нужно"),
      valueId: z.string().optional().describe("Для перечисления (действие «выбрать значение»): id значения"),
      ...effectWhen,
    })
    .describe("Изменить переменную: флаг — поставить, снять или переключить; счётчик — прибавить, отнять или задать значение (в границах счётчика); перечисление — выбрать значение"),
  z.object({ type: z.literal("removeEvidence"), evidenceId: z.string(), ...effectWhen }).describe("Убрать улику из дела (отдал ключ, расход предмета)"),
  z
    .object({ type: z.literal("playAnimation"), objectId: z.string(), clip: z.array(ClipStep).min(1), ...effectWhen })
    .describe("Проиграть анимацию предмета один раз, не меняя его состояния (диалог заставил дверь постучать); только вид, на условия не влияет"),
  z.object({ type: z.literal("startDialogue"), dialogueId: z.string(), ...effectWhen }).describe("Запустить диалог (после остальных эффектов списка)"),
  z
    .object({ type: z.literal("travel"), locationId: z.string(), x: z.number().int(), y: z.number().int(), ...effectWhen })
    .describe("Перенести игрока в локацию, на клетку x, y"),
  z
    .object({ type: z.literal("failCase"), text: z.string().optional().describe("Что увидит игрок в окне «Дело провалено»"), ...effectWhen })
    .describe("Неудачное завершение дела: игрок видит окно и начинает заново; результат не записывается"),
  z.object({ type: z.literal("message"), text: z.string(), ...effectWhen }).describe("Показать игроку короткое сообщение (без диалога)"),
  z.object({ type: z.literal("addCharacterNote"), characterId: z.string(), text: z.string(), ...effectWhen }),
  z.object({ type: z.literal("follow"), characterId: z.string(), ...effectWhen }).describe("Персонаж идёт за игроком"),
  z.object({ type: z.literal("stay"), characterId: z.string(), ...effectWhen }).describe("Перестаёт идти следом и остаётся, где стоит"),
  z.object({ type: z.literal("returnHome"), characterId: z.string(), ...effectWhen }).describe("Возвращается на своё исходное место"),
  z
    .object({
      type: z.literal("moveTo"),
      characterId: z.string(),
      locationId: z.string(),
      x: z.number().int(),
      y: z.number().int(),
      zoneId: z.string().optional().describe("Область цели: персонаж встанет на свободную клетку внутри неё (клетка x, y — запасная)"),
      failText: z.string().optional().describe("Что скажет персонаж, если не сможет дойти"),
      ...effectWhen,
    })
    .describe("Персонаж идёт на клетку карты и остаётся там; за игроком не следует"),
]);

/** Приложение к улике: файл или ссылка. Для ссылки `src` — адрес (http/https), `caption` — текст, который увидит игрок. */
export const Attachment = z.object({
  kind: z.enum(["image", "scan", "audio", "video", "voice", "link"]).meta({ title: "Тип" }),
  src: z.string(),
  caption: z.string(),
});

export const HairStyle = z.enum(["short", "long", "bun", "cap", "ponytail", "curly", "bald", "bob", "headscarf"]);
export const AccentStyle = z.enum(["collar", "tie", "scarf", "badge", "apron"]);

/** Своя внешность персонажа (цвета — #rrggbb). */
export const CustomLook = z.object({
  skin: z.string(),
  hair: z.string(),
  hairStyle: HairStyle,
  top: z.string(),
  accent: z.string(),
  accentStyle: AccentStyle,
  legs: z.string(),
  shoes: z.string(),
  glasses: z.boolean(),
  mustache: z.boolean(),
  beard: z.boolean(),
  eyes: z.string().optional(),
  glassesColor: z.string().optional(),
  bottom: z.enum(["pants", "skirt"]).optional(),
});

export const Character = z.object({
  id: z.string(),
  name: z.string(),
  look: Appearance.describe("Готовый облик (образец); в одном деле внешность не должна повторяться"),
  appearance: CustomLook.optional().describe("Своя внешность; если задана, заменяет готовый облик"),
  position: z.string().describe("Должность или статус, например «студентка 3 курса»"),
  description: z.string(),
});

/** Момент события: «ГГГГ-ММ-ДД» или «ММ-ДД» (год необязателен), с необязательным временем «Tчч:мм». */
export const EventTime = z.string().regex(/^(\d{4}-)?\d{2}-\d{2}(T\d{2}:\d{2})?$/, "Ожидается «ГГГГ-ММ-ДД» или «ММ-ДД», можно с «Tчч:мм»");

export const CaseEvent = z.object({
  id: z.string(),
  title: z.string(),
  at: EventTime.describe("Когда произошло (начало, если задан «до»)"),
  until: EventTime.optional().describe("Конец, если событие длилось (диапазон «с … по …»)"),
  showInTimeline: z.boolean().optional().meta({ always: true }).describe("Показывать в хронологии. Выключено — событие остаётся в деле (например, как подпись у улики), но на шкале его нет"),
  requires: Condition.optional().describe("Когда игрок узнаёт о событии: в хронологию оно попадает, только если условие выполнено"),
});

export const Evidence = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().describe("Короткое описание для карточки"),
  details: z.string().describe("Полный текст: содержимое документа, показания и т.п."),
  kind: z.enum(["evidence", "testimony", "item"]).describe("Улика (документ, вещь, цифровой след…), показания или предмет (ключ, фонарь: лежит в журнале, но уликой не считается — в сопоставления и вопросы не попадает)"),
  subtype: z.string().optional().describe("Вид улики для подписи: «Документ», «Цифровой след», «Вещь»"),
  relatedCharacters: z.array(z.string()),
  relatedEvents: z.array(z.string()),
  reliability: Reliability,
  attachments: z.array(Attachment).optional(),
  onCollect: z.array(Effect).default([]).describe("Эффекты в момент, когда улика попала в дело (один раз)"),
});

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
  "bus_stop",
  "mailbox",
  "door_h",
  "door_v",
]);

const SpriteOp = z.union([
  z.tuple([z.number().int(), z.number().int(), z.number().int().min(1), z.number().int().min(1), z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i)]),
  z.tuple([z.number().int(), z.number().int(), z.number().int().min(1), z.number().int().min(1)]),
]);

/** Спрайт, нарисованный автором дела (встроенные хранятся только ключом): те же поля, что у встроенного, плюс название и группа. */
export const CustomSprite = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/).describe("Ключ: латиница, цифры, _; не совпадает со встроенным"),
  name: z.string().describe("Название в палитре"),
  group: z.string().optional().describe("Группа палитры; без значения — «Свои»"),
  w: z.number().int().min(1).max(256).describe("Ширина в пикселях (16 px = тайл)"),
  h: z.number().int().min(1).max(256).describe("Высота в пикселях"),
  footprint: z.object({ w: z.number().int().min(1).max(16), h: z.number().int().min(1).max(16) }).describe("Опора в клетках: вправо и вверх от точки предмета"),
  solid: z.boolean().describe("Мешает ли проходу"),
  cells: z.array(z.object({ dx: z.number().int(), dy: z.number().int(), solid: z.boolean() })).optional().describe("Исключения из solid по клеткам опоры"),
  flat: z.boolean().optional(),
  mount: z.number().int().optional(),
  opensNear: z.boolean().optional(),
  mirrorRight: z.boolean().optional(),
  frames: z.record(z.string(), z.array(SpriteOp)).refine((f) => Array.isArray(f.default), "нужен кадр default"),
});

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
  onInteract: z.array(Effect).default([]).meta({ always: true }).describe("Эффекты осмотра предмета (при каждом осмотре; «только один раз» — у самого эффекта); выдача улики — в окне осмотра"),
});

/** Улики, которые может выдать осмотр предмета (эффекты «добавить улику в дело» в `onInteract`, независимо от условий). */
export const objectEvidenceIds = (o: { onInteract?: { type: string; evidenceId?: string }[]; states?: { onInteract?: { type: string; evidenceId?: string }[] }[] }): string[] => [
  ...new Set([...(o.onInteract ?? []), ...(o.states ?? []).flatMap((st) => st.onInteract ?? [])].flatMap((e) => (e.type === "addEvidence" && e.evidenceId ? [e.evidenceId] : []))),
];

/** Предмет, с которым можно взаимодействовать: есть окно осмотра или эффекты. */
export const isInteractive = (o: { interaction?: unknown; onInteract?: unknown[]; states?: { interaction?: unknown; onInteract?: unknown[] }[] }): boolean =>
  !!o.interaction || !!o.onInteract?.length || !!o.states?.some((st) => st.interaction || st.onInteract?.length);

/** Диалог персонажа, доступный при условии (например, очная ставка: другой персонаж идёт за игроком). */
export const NpcDialogue = z.object({
  dialogueId: z.string(),
  requires: Condition.optional().meta({ always: true }).describe("Когда этот диалог доступен"),
});

export const NpcPlacement = z.object({
  id: z.string(),
  characterId: z.string(),
  dialogueId: z.string().describe("Диалог по умолчанию — запускается, если ни один из `dialogues` не подошёл"),
  requires: Condition.optional().describe("Человек есть на карте, только пока условие выполнено; без условия — всегда"),
  dialogues: z
    .array(NpcDialogue)
    .default([])
    .describe("Диалоги по условию, по порядку: запускается первый подходящий; очная ставка — диалог с условием «другой персонаж идёт за игроком»"),
  x: z.number().int(),
  y: z.number().int(),
});

const Point = z.object({ x: z.number().int(), y: z.number().int() });

/** Когда срабатывает действие области (`ZoneAction.trigger`; без значения — `use`). */
export type ZoneTrigger = "use" | "enter" | "enterEvery" | "leave";
/** Срабатывает само при входе в область. */
export const isEntryTrigger = (t: ZoneTrigger | undefined): boolean => t === "enter" || t === "enterEvery";

/** Что делает область, когда игрок в ней. Из подходящих (`requires`) срабатывает первое по порядку списка. */
const actionBase = {
  requires: Condition.optional().describe("Когда действие доступно"),
  trigger: z
    .enum(["use", "enter", "enterEvery", "leave"])
    .optional()
    .describe("Когда срабатывает: по клавише взаимодействия, пока игрок внутри (по умолчанию); при входе в область (один раз); при каждом входе; при выходе из области"),
  lockedText: z.string().optional().describe("Что сказать игроку, если условие не выполнено (например, «Нужен ключ от комнаты»); без текста — молча"),
};
export const ZoneAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dialogue"), dialogueId: z.string(), ...actionBase }).describe("Запустить диалог"),
  z.object({ kind: z.literal("object"), objectId: z.string(), ...actionBase }).describe("Взаимодействие с предметом (осмотр, улика)"),
  z.object({ kind: z.literal("effects"), effects: z.array(Effect), ...actionBase }).describe("Применить эффекты (флаг, улика, персонаж…) без диалога"),
  z
    .object({
      kind: z.literal("exit"),
      to: z.string().describe("id локации, куда ведёт выход"),
      spawn: Point.describe("Где игрок появится в целевой локации"),
      ...actionBase,
    })
    .describe("Выход в другую локацию"),
]);

/** Именованная область карты с действиями: запуск диалога, взаимодействие с предметом, выход. */
export const Zone = z
  .object({
    id: z.string(),
    name: z.string(),
    cells: z.array(Point),
    actions: z.array(ZoneAction).default([]),
    fallback: z
      .object({
        text: z.string().optional().describe("Что сказать игроку"),
        effects: z.array(Effect).default([]).describe("Что применить"),
      })
      .optional()
      .describe("Запасной ответ: срабатывает при входе в область и по клавише взаимодействия, когда ни одно действие не подошло"),
    color: z.string().optional().describe("Цвет области в конструкторе (#rrggbb); без цвета — подбирается по ключу. В игре область не видна"),
  })
  .describe("Область на карте из клеток");

export const Location = z.object({
  id: z.string(),
  name: z.string(),
  tiles: z
    .array(z.string())
    .describe(
      "Карта по строкам одинаковой длины. Стены: # стена, W окно, B кирпич, G стекло, P крашеная, F забор. Пол: . плитка, , ковролин, _ паркет, w тёмный паркет, b линолеум, k кафель, m мрамор, r ковровая дорожка, S лестница, D проём, g трава, a асфальт, p тротуар",
    ),
  areas: z.array(
    z.object({ name: z.string(), x: z.number().int(), y: z.number().int() }),
  ).describe("Подписи на карте: помещения, места, что угодно (не только области)"),
  playerStart: z
    .object({ x: z.number().int(), y: z.number().int() })
    .optional()
    .describe("Старт игрока: задан ровно в одной локации — она и стартовая"),
  objects: z.array(LocationObject),
  npcs: z.array(NpcPlacement),
  zones: z.array(Zone).default([]).describe("Именованные области с действиями: диалог, предмет, выход в другую локацию"),
  onEnter: z.array(Effect).default([]).describe("Эффекты при входе игрока в локацию (при каждом входе; «только один раз» — у самого эффекта)"),
});

export const DialogueChoice = z.object({
  id: z.string(),
  text: z.string(),
  next: z.string().nullable().describe("id следующего узла или null — закончить разговор"),
  requires: Condition.optional(),
  effects: z.array(Effect).default([]).meta({ always: true }).describe("Что произойдёт, когда игрок выберет этот вариант (до ответа персонажа)"),
});

export const DialogueNode = z.object({
  id: z.string(),
  speaker: z.string().optional().describe("Кто говорит (id персонажа); по умолчанию — хозяин диалога"),
  text: z.string(),
  textVariants: z
    .array(z.object({ requires: Condition, text: z.string() }))
    .optional()
    .describe("Другой текст реплики по условию: показывается первый, чьё условие выполнено, иначе — основной текст"),
  mood: z.enum(["neutral", "friendly", "nervous", "angry", "sad"]),
  effects: z.array(Effect),
  choices: z.array(DialogueChoice),
  auto: z
    .boolean()
    .optional()
    .describe("Переход без выбора игрока: узел не показывается, а первый вариант с выполненным условием срабатывает сам (эффекты варианта применяются, текст варианта и реплики игроку не виден)"),
});

export const Dialogue = z.object({
  id: z.string(),
  characterId: z.string(),
  startNodeId: z.string(),
  nodes: z.array(DialogueNode),
});

export const Deduction = z.object({
  id: z.string(),
  title: z.string(),
  evidenceIds: z
    .array(z.string())
    .describe("Два материала: улики или уже установленные факты (id сопоставления) — так строятся цепочки"),
  question: z.string(),
  options: z.array(
    z.object({ id: z.string(), text: z.string(), correct: z.boolean(), feedback: z.string() }),
  ),
  conclusion: z.string().describe("Установленный факт, попадает в журнал"),
  requires: Condition.optional().describe("Когда сопоставление доступно: пока условие не выполнено, эти материалы игра не связывает (как будто сопоставления нет)"),
  effects: z.array(Effect).describe("Эффекты верного ответа"),
  failEffects: z.array(Effect).default([]).describe("Эффекты неверного ответа (при каждой ошибке): штраф, флаг, сообщение…"),
});

export const Hint = z.object({
  level: z.number().int().describe("1 — на объект, 2 — связать улики, 3 — намёк на право"),
  text: z.string(),
  penalty: z.number().int(),
  requires: Condition.optional().describe("Когда подсказку можно открыть. Подсказки открываются по порядку уровней: пока условие не выполнено, эту и следующие открыть нельзя"),
});

export const QuestionCategory = z.enum(["right", "violation", "qualification", "responsible", "evidence"]);

export const Question = z.object({
  id: z.string(),
  category: QuestionCategory,
  prompt: z.string(),
  kind: z.enum(["single", "multi"]),
  source: z
    .enum(["inline", "characters", "evidence"])
    .describe("characters/evidence — варианты берутся из персонажей/найденных улик, label можно оставить пустым"),
  maxPoints: z.number().int(),
  options: z.array(
    z.object({
      id: z.string(),
      label: z.string().meta({ title: "Ответ" }),
      mark: z.string().default("").describe("Подпись мелким шрифтом под ответом, например статья закона"),
      points: z.number().int(),
      feedback: z.string(),
    }),
  ),
});

export const LiabilityKind = z.enum([
  "right",
  "violation",
  "administrative",
  "criminal",
  "civil",
  "disciplinary",
]);

export const Solution = z.object({
  right: z.string().describe("id права: совпадает с id одного из вариантов вопроса категории right"),
  rightText: z.string().describe("Какое право затронуто и на какой норме это основано (текст)"),
  violation: z.boolean(),
  responsibleCharacter: z.string(),
  correctAnswer: z.string(),
  whatHappened: z.string(),
  explanation: z.string(),
  legalQualification: z.string(),
  qualificationNotes: z.array(
    z.object({
      kind: LiabilityKind,
      applies: z.enum(["yes", "no", "possible"]),
      text: z.string(),
    }),
  ),
  keyEvidence: z.array(z.object({ evidenceId: z.string(), why: z.string() })),
  sources: z.array(z.string()),
});

/** Норма правовой базы: чип со статьёй, название, текст, ссылка. */
export const LawBasis = z.object({
  article: z.string().optional().describe("Статья для чипа: «ч. 1 ст. 137 УК РФ»"),
  title: z.string(),
  text: z.string().optional(),
  url: z.string().optional().describe("Ссылка на текст нормы"),
});

/** Пояснение автора: нумеруется, есть необязательный подзаголовок. */
export const LawNote = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
});

export const LICENSES = ["cc-by-4.0", "cc-by-sa-4.0", "cc-by-nc-4.0", "cc0", "all-rights-reserved", "unspecified"] as const;
export const License = z.enum(LICENSES);
export const LICENSE_LABEL: Record<(typeof LICENSES)[number], string> = {
  "cc-by-4.0": "CC BY 4.0",
  "cc-by-sa-4.0": "CC BY-SA 4.0",
  "cc-by-nc-4.0": "CC BY-NC 4.0",
  cc0: "CC0 (общественное достояние)",
  "all-rights-reserved": "Все права защищены",
  unspecified: "Лицензия не указана",
};

/** Авторство и лицензия дела. Всё показывается игрокам, включая почту: другого канала связи с автором нет. */
export const CaseMeta = z.object({
  authorName: z.string().default("").describe("Имя автора или коллектива"),
  authorEmail: z.string().default("").describe("Для связи; игроки видят её в деле. Не хотите писем — оставьте пустой"),
  license: License.default("cc-by-4.0").describe("Лицензия на содержание дела"),
  sourceUrl: z.string().default("").describe("Ссылка на источник или первоисточник"),
  licenseNote: z.string().default("").describe("Пояснение к лицензии, например исключения"),
});

export const CaseFile = z.object({
  sprites: z.array(CustomSprite).optional().describe("Спрайты, нарисованные в деле"),
  formatVersion: z.number().int().optional().describe("Версия формата файла дела (ставится само; нет поля = 1)"),
  id: z.string(),
  number: z.string(),
  title: z.string(),
  tagline: z.string(),
  introduction: z.string(),
  /** Устарело: тема-право раскрывала ответ; оставлено для старых файлов. */
  topic: z.string().optional(),
  flags: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().describe("Что означает флаг, по-русски"),
        initial: z.boolean().optional().describe("Стоит с начала расследования"),
      }),
    )
    .optional()
    .describe("Флаги дела: пометки «это уже произошло» с русскими названиями"),
  counters: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().describe("Что считает счётчик, по-русски"),
        initial: z.number().int().optional().describe("Значение в начале расследования (по умолчанию 0)"),
        min: z.number().int().optional().describe("Наименьшее значение: меньше счётчик не опустится"),
        max: z.number().int().optional().describe("Наибольшее значение: больше счётчик не вырастет"),
      }),
    )
    .optional()
    .describe("Счётчики дела: числа, которые меняют эффекты и проверяют условия"),
  enums: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().describe("Что описывает перечисление, по-русски (например, «Сейф»)"),
        values: z.array(z.object({ id: z.string(), name: z.string().describe("Название значения, по-русски (например, «Закрыт»)") })).describe("Возможные значения; в каждый момент действует ровно одно"),
        initial: z.string().optional().describe("Значение в начале расследования (по умолчанию — первое)"),
      }),
    )
    .optional()
    .describe("Перечисления дела: переменная, у которой в каждый момент одно из заданных значений (закрыт / открыт / сломан)"),
  lawReference: z
    .object({
      basis: z.array(LawBasis).describe("Правовая база: статьи нормативных актов, другие документы"),
      notes: z.array(LawNote).describe("Пояснения автора; нумеруются — на них можно сослаться в подсказке"),
    })
    .optional()
    .describe("Вкладка «Закон» у игрока"),
  difficulty: z.enum(["easy", "medium", "hard"]),
  published: z.boolean().describe("Показывать дело игрокам в списке дел"),
  timeBonus: z
    .object({
      minutes: z.number().int().describe("За сколько минут нужно уложиться"),
      points: z.number().int().describe("Сколько баллов сверх суммы за вопросы дать за это"),
      minScore: z
        .number()
        .int()
        .min(0)
        .optional()
        .meta({ always: true })
        .describe("Бонус дают, только если набрано не меньше этого числа баллов. Пусто или 0 — при любом результате выше нуля"),
    })
    .optional()
    .describe("Бонус за скорость: время считается от начала расследования"),
  settings: z
    .object({
      timelineYear: z.number().int().min(1).max(9999).optional().describe("Год для событий без года: на хронологии не показывается"),
    })
    .optional()
    .describe("Настройки: какие возможности дела включены"),
  meta: CaseMeta.optional(),
  updatedAt: z
    .string()
    .optional()
    .describe("Когда дело последний раз меняли, ISO 8601 (2026-10-12T15:30:00Z). Сохранения игроков от другой версии сбрасываются"),
  locations: z.array(Location).describe("Первая — стартовая"),
  characters: z.array(Character),
  events: z.array(CaseEvent),
  evidence: z.array(Evidence),
  dialogues: z.array(Dialogue),
  deductions: z.array(Deduction),
  hints: z.array(Hint),
  questions: z.array(Question),
  solution: Solution,
});

export type CaseFile = z.infer<typeof CaseFile>;
export type Character = z.infer<typeof Character>;
export type Evidence = z.infer<typeof Evidence>;
export type CaseEvent = z.infer<typeof CaseEvent>;
export type Dialogue = z.infer<typeof Dialogue>;
export type DialogueNode = z.infer<typeof DialogueNode>;
export type DialogueChoice = z.infer<typeof DialogueChoice>;
export type Effect = z.infer<typeof Effect>;
export type Deduction = z.infer<typeof Deduction>;
export type Question = z.infer<typeof Question>;
export type QuestionCategory = z.infer<typeof QuestionCategory>;
export type LocationObject = z.infer<typeof LocationObject>;
export type ObjectState = z.infer<typeof ObjectState>;
export type NpcPlacement = z.infer<typeof NpcPlacement>;
export type Location = z.infer<typeof Location>;
export type Zone = z.infer<typeof Zone>;
export type ZoneAction = z.infer<typeof ZoneAction>;
export type NpcDialogue = z.infer<typeof NpcDialogue>;
export type SpriteKey = z.infer<typeof SpriteKey>;
export type CustomSprite = z.infer<typeof CustomSprite>;
export type Appearance = z.infer<typeof Appearance>;
export type CustomLook = z.infer<typeof CustomLook>;
export type HairStyle = z.infer<typeof HairStyle>;
export type AccentStyle = z.infer<typeof AccentStyle>;
export type LiabilityKind = z.infer<typeof LiabilityKind>;
export type Hint = z.infer<typeof Hint>;
export type Solution = z.infer<typeof Solution>;
