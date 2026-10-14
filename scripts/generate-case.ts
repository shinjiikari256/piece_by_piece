/**
 * Генератор черновиков дел через Claude API.
 *
 *   pnpm generate:case --topic="тайна переписки" --difficulty=medium --evidence=6 --characters=4
 *
 * Результат — apps/client/src/content/cases/case-NNN.json, скрытый из списка (published: false).
 * Юридическое содержание черновика обязательно проверяет человек (ТЗ, п. 14).
 * Без доступа к API игра продолжает работать на уже готовых JSON.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { validateCase } from "../apps/client/src/content/validate";
import { CaseFile } from "../shared/case";
import { APP_NAME } from "../shared/brand";

const MODEL = "claude-opus-5-5";
const CASES_DIR = path.resolve("apps/client/src/content/cases");
const EXAMPLE = path.join(CASES_DIR, "case-001.json");
const MAX_REPAIRS = 2;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    topic: { type: "string" },
    difficulty: { type: "string", default: "medium" },
    evidence: { type: "string", default: "6" },
    characters: { type: "string", default: "4" },
    out: { type: "string" },
    force: { type: "boolean", default: false },
  },
});

const topic = args.topic?.trim() ?? "";
const difficulty = args.difficulty!;
const evidenceCount = Number(args.evidence);
const characterCount = Number(args.characters);

if (!topic) fail("--topic: тема дела, например \"тайна переписки\" или \"расторжение трудового договора\"");
if (!["easy", "medium", "hard"].includes(difficulty)) fail("--difficulty: easy | medium | hard");
if (!Number.isInteger(evidenceCount) || evidenceCount < 5 || evidenceCount > 12) fail("--evidence: целое от 5 до 12");
if (!Number.isInteger(characterCount) || characterCount < 3 || characterCount > 5) fail("--characters: целое от 3 до 5");

function nextCasePath() {
  const taken = new Set(readdirSync(CASES_DIR).map((f) => f.match(/^case-(\d{3})\.json$/)?.[1]).filter(Boolean));
  for (let n = 1; n < 1000; n++) {
    const num = String(n).padStart(3, "0");
    if (!taken.has(num)) return { file: path.join(CASES_DIR, `case-${num}.json`), num };
  }
  fail("нет свободного номера дела");
}

const target = args.out
  ? { file: path.resolve(args.out), num: path.basename(args.out).match(/(\d+)/)?.[1] ?? "000" }
  : nextCasePath();
if (existsSync(target.file) && !args.force) fail(`${target.file} уже существует (используйте --force)`);

const SYSTEM = `Ты — автор учебных детективных сценариев для браузерной игры «${APP_NAME}» для студентов юридического факультета. Право — российское; отрасль определяется темой дела.

Игрок — дознаватель полиции: проверяет заявление о преступлении. Он исследует место (одну или несколько локаций, связанных дверями-выходами), собирает улики, расспрашивает персонажей, сопоставляет факты и в конце определяет: какое право затронуто, было ли нарушение, кто отвечает и какими доказательствами это подтверждается.

Юридические требования — главное:
- Ссылайся только на статьи, в существовании и содержании которых уверен (Конституция РФ, УК РФ, КоАП РФ, ГК РФ, ТК РФ, ФЗ «Об образовании в РФ», ФЗ «О персональных данных»). Сомневаешься — не ссылайся.
- Не утверждай, что действие — преступление, только потому что оно затрагивает чьё-то право. Квалификацию формулируй как «возможную» и указывай, что вывод о виновности делает суд.
- Чётко различай: затронутое право, нарушение права, административное правонарушение, преступление, гражданско-правовой спор, дисциплинарное нарушение. В solution.qualificationNotes дай оценку по каждой из шести категорий.
- Внутренние положения организации — вымышленные; помечай это в sources.
- Не используй реальных людей, организаций и узнаваемых персонажей. Домены — вида univ.example.

Игровые требования:
- Персонажи обращаются к игроку как к сотруднику полиции; игрок говорит со всеми на «вы».
- Очная ставка: в диалоге один персонаж может согласиться пойти с игроком (эффект follow); если привести его к другому, открывается разговор втроём (confrontations, у реплик — speaker). Неосторожная реплика игрока может сорвать очную ставку.
- Механика интереснее объёма: у ответов в диалогах есть последствия (грубый тон закрывает собеседника, предъявленные улики открывают новые реплики через requires.evidence), хотя бы один персонаж лжёт (isLie: true), противоречие можно доказать уликами.
- Вопросы в списке реплик отмечай once: true — после выбора они остаются в списке с пометкой «уже спрашивали». Если игрок переспросит, персонаж недовольно повторит ответ: у диалога есть repeatLine (вступление вроде «Я же уже говорил…»), а для ключевых вопросов и лжи задай свою реплику repeat.
- У каждой улики есть источник: объект локации с interaction.type = "evidence" или эффект addEvidence в диалоге.
- Сопоставления (deductions): 2–3 улики, ровно один верный вариант, наборы улик не повторяются.
- Версии: несколько ложных, правдоподобных, и одна верная.
- Подсказки уровней 1, 2, 3 (на объект, на связь улик, намёк на право) со штрафами 5, 7, 10.
- Вопросы — ровно пять, по одному на категорию: right (maxPoints 30, source inline, варианты — права или нормы, которые могли быть затронуты, id латиницей), violation (15, варианты yes/no/insufficient), qualification (15), responsible (20, source characters, вариант на каждого персонажа), evidence (20, kind multi, source evidence, вариант на каждую улику; сумма положительных баллов ровно 20; ложные показания — отрицательные баллы). Для single-вопросов максимальный балл варианта равен maxPoints. Сумма maxPoints = 100.
- Частичные баллы за близкие, но неточные ответы, и объяснение в feedback к каждому варианту.
- Локацию бери из примера (те же tiles), меняй расстановку объектов и названия помещений. Объекты и NPC — на клетках пола, не друг на друге; у каждого персонажа есть NPC с диалогом.
- Все id ссылок должны существовать. Тексты — на русском, живо и без мрачности.`;

function userPrompt() {
  return `Сгенерируй новое дело.

Параметры:
- тема дела (право, отрасль, нормы): ${topic}
- сложность: ${difficulty}
- улик: ${evidenceCount}
- персонажей: ${characterCount}
- id дела: "case-${target.num}", number: "${target.num}"
- published: false (дело появится в списке после проверки человеком)

solution.right — id одного из вариантов вопроса right.

Готовое проверенное дело для примера структуры, стиля и баланса (не копируй сюжет):
${readFileSync(EXAMPLE, "utf8")}`;
}

async function main() {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userPrompt() }];

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    console.log(attempt === 0 ? `→ Генерирую дело (${MODEL})…` : `→ Исправляю ошибки, попытка ${attempt}…`);
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(CaseFile) },
      system: SYSTEM,
      messages,
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") fail(`модель отказалась: ${response.stop_details?.explanation ?? "без пояснения"}`);
    if (response.stop_reason === "max_tokens") fail("ответ обрезан по max_tokens — уменьшите --evidence или --characters");

    const raw = response.parsed_output;
    if (!raw) fail("не удалось разобрать ответ модели");

    const result = validateCase(raw);
    if (result.ok) {
      const caseFile = { ...result.caseFile, updatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
      writeFileSync(target.file, JSON.stringify(caseFile, null, 2) + "\n");
      console.log(`✓ ${path.relative(process.cwd(), target.file)} — «${result.caseFile.title}»`);
      console.log("  Статус: черновик. Перед мероприятием юридическое содержание проверяет человек;");
      console.log('  после проверки поставьте published: true — дело появится в списке.');
      return;
    }

    console.log(`  Найдено ошибок: ${result.errors.length}`);
    messages.push(
      { role: "assistant", content: response.content },
      {
        role: "user",
        content: `Валидатор нашёл ошибки. Верни полностью исправленное дело.\n- ${result.errors.join("\n- ")}`,
      },
    );
  }
  fail(`дело не прошло валидацию после ${MAX_REPAIRS} исправлений`);
}

main().catch((error) => {
  if (error instanceof Anthropic.AuthenticationError) {
    fail("нет доступа к Claude API: задайте ANTHROPIC_API_KEY. Игра продолжает работать на готовых JSON.");
  }
  if (error instanceof Anthropic.RateLimitError) fail("превышен лимит запросов — повторите позже");
  if (error instanceof Anthropic.APIConnectionError) {
    fail("Claude API недоступен (нет сети?). Игра продолжает работать на готовых JSON.");
  }
  if (error instanceof Anthropic.APIError) fail(`ошибка API ${error.status}: ${error.message}`);
  if (error instanceof Error && /api ?key|authentication|credentials/i.test(error.message)) {
    fail("нет доступа к Claude API: задайте ANTHROPIC_API_KEY. Игра продолжает работать на готовых JSON.");
  }
  throw error;
});
