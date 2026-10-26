import { z } from "zod";
import { Condition, Effect } from "./case-logic";
import { CustomPart, CustomSprite, CustomTile, LocationObject } from "./case-objects";

export * from "./case-logic";
export * from "./case-objects";

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


/** Приложение к улике: файл или ссылка. Для ссылки `src` — адрес (http/https), `caption` — текст, который увидит игрок. */
export const Attachment = z.object({
  kind: z.enum(["image", "scan", "audio", "video", "voice", "link"]).meta({ title: "Тип" }),
  src: z.string(),
  caption: z.string(),
});

/** Ключи частей персонажа: встроенных (`short`, `tie`…) или частей дела (`CaseFile.parts`); существование проверяет валидатор. */
export const HairStyle = z.string().describe("Ключ причёски (часть слота «hair»)");
export const AccentStyle = z.string().describe("Ключ детали одежды (часть слота «accent»)");

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
  bottom: z.string().optional().describe("Ключ низа (часть слота «bottom»); без ключа — брюки"),
  faceParts: z.array(z.string()).optional().describe("Ключи дополнительных деталей лица (слот «face») — например, части дела"),
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
  kind: z
    .enum(["evidence", "testimony", "item"])
    .describe("Улика (документ, вещь, цифровой след…), показания или предмет (ключ, фонарь: лежит в журнале, но уликой не считается — в сопоставления и вопросы не попадает)"),
  subtype: z.string().optional().describe("Вид улики для подписи: «Документ», «Цифровой след», «Вещь»"),
  relatedCharacters: z.array(z.string()),
  relatedEvents: z.array(z.string()),
  reliability: Reliability,
  attachments: z.array(Attachment).optional(),
  onCollect: z.array(Effect).default([]).describe("Эффекты в момент, когда улика попала в дело (один раз)"),
});


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
  dialogues: z.array(NpcDialogue).default([]).describe("Диалоги по условию, по порядку: запускается первый подходящий; очная ставка — диалог с условием «другой персонаж идёт за игроком»"),
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
  areas: z.array(z.object({ name: z.string(), x: z.number().int(), y: z.number().int() })).describe("Подписи на карте: помещения, места, что угодно (не только области)"),
  playerStart: z.object({ x: z.number().int(), y: z.number().int() }).optional().describe("Старт игрока: задан ровно в одной локации — она и стартовая"),
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

export const DialoguePresentation = z.object({
  id: z.string(),
  evidenceIds: z.array(z.string()).default([]).meta({ always: true }).describe("Какие материалы это предъявление принимает; пусто — любой"),
  next: z.string().nullable().describe("id следующего узла (реакция персонажа) или null — закончить разговор"),
  requires: Condition.optional(),
  effects: z.array(Effect).default([]).meta({ always: true }).describe("Что произойдёт, когда игрок предъявит материал (до реакции персонажа)"),
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
  presentations: z
    .array(DialoguePresentation)
    .optional()
    .describe(
      "Предъявление материала из журнала: в этом узле появляется кнопка «Предъявить». Срабатывает первое подходящее по порядку (материал в списке или список пуст, условие выполнено); нет подходящего — собеседник не реагирует",
    ),
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
  evidenceIds: z.array(z.string()).describe("Два материала: улики или уже установленные факты (id сопоставления) — так строятся цепочки"),
  question: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string(), correct: z.boolean(), feedback: z.string() })),
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
  source: z.enum(["inline", "characters", "evidence"]).describe("characters/evidence — варианты берутся из персонажей/найденных улик, label можно оставить пустым"),
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

export const LiabilityKind = z.enum(["right", "violation", "administrative", "criminal", "civil", "disciplinary"]);

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
  tiles: z.array(CustomTile).optional().describe("Тайлы карты, нарисованные в деле"),
  legend: z.record(z.string().length(1), z.string()).optional().describe("Легенда карты: символ в строках карты → ключ тайла (встроенного или из тайлов дела)"),
  parts: z.array(CustomPart).optional().describe("Части персонажей, нарисованные в деле: причёски, детали одежды, лицо, низ"),
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
        values: z
          .array(z.object({ id: z.string(), name: z.string().describe("Название значения, по-русски (например, «Закрыт»)") }))
          .describe("Возможные значения; в каждый момент действует ровно одно"),
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
      minScore: z.number().int().min(0).optional().meta({ always: true }).describe("Бонус дают, только если набрано не меньше этого числа баллов. Пусто или 0 — при любом результате выше нуля"),
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
  updatedAt: z.string().optional().describe("Когда дело последний раз меняли, ISO 8601 (2026-10-12T15:30:00Z). Сохранения игроков от другой версии сбрасываются"),
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
export type Deduction = z.infer<typeof Deduction>;
export type Question = z.infer<typeof Question>;
export type QuestionCategory = z.infer<typeof QuestionCategory>;
export type NpcPlacement = z.infer<typeof NpcPlacement>;
export type Location = z.infer<typeof Location>;
export type Zone = z.infer<typeof Zone>;
export type ZoneAction = z.infer<typeof ZoneAction>;
export type NpcDialogue = z.infer<typeof NpcDialogue>;
export type Appearance = z.infer<typeof Appearance>;
export type CustomLook = z.infer<typeof CustomLook>;
export type HairStyle = z.infer<typeof HairStyle>;
export type AccentStyle = z.infer<typeof AccentStyle>;
export type LiabilityKind = z.infer<typeof LiabilityKind>;
export type Hint = z.infer<typeof Hint>;
export type Solution = z.infer<typeof Solution>;
