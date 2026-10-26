import { z } from "zod";

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
  z.object({ type: z.literal("travel"), locationId: z.string(), x: z.number().int(), y: z.number().int(), ...effectWhen }).describe("Перенести игрока в локацию, на клетку x, y"),
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

export type Effect = z.infer<typeof Effect>;
