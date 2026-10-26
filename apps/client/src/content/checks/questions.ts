import type { Ctx } from "./context";

/** Вопросы и баллы. */
export function checkQuestions(ctx: Ctx) {
  const { c, err, ref, characters, evidence, itemIds } = ctx;
  // Вопросы и баллы
  let total = 0;
  for (const q of c.questions) {
    const where = `question ${q.id}`;
    const ids = q.options.map((o) => o.id);
    if (q.source === "characters") {
      ids.forEach((id) => ref(characters, id, where));
      characters.forEach((id) => ids.includes(id) || err(`${where}: нет варианта для персонажа «${id}»`));
    }
    if (q.source === "evidence") {
      ids.forEach((id) => ref(evidence, id, where));
      // предметы (ключ, фонарь) уликами не считаются и в вопросах не участвуют
      ids.forEach((id) => itemIds.has(id) && err(`${where}: «${id}» — предмет, а не улика; убери его из вариантов`));
      evidence.forEach((id) => itemIds.has(id) || ids.includes(id) || err(`${where}: нет варианта для улики «${id}»`));
    }
    const best = q.kind === "multi" ? q.options.reduce((s, o) => s + Math.max(0, o.points), 0) : Math.max(...q.options.map((o) => o.points));
    if (best !== q.maxPoints) err(`${where}: максимум по вариантам ${best}, а maxPoints ${q.maxPoints}`);
    total += q.maxPoints;
  }
  if (total <= 0) err("questions: сумма maxPoints должна быть больше нуля");
  if (c.timeBonus?.minScore != null && c.timeBonus.minScore > total) err(`timeBonus: порог ${c.timeBonus.minScore} баллов больше максимума ${total} — бонус недостижим`);
  for (const cat of ["right", "violation", "qualification", "responsible", "evidence"] as const) {
    if (!c.questions.some((q) => q.category === cat)) err(`questions: нет вопроса категории «${cat}»`);
  }

}

/** Решение дела. */
export function checkSolution(ctx: Ctx) {
  const { c, err, ref, characters, evidence } = ctx;
  // Решение
  ref(new Set(c.questions.find((q) => q.category === "right")?.options.map((o) => o.id)), c.solution.right, "solution.right");
  ref(characters, c.solution.responsibleCharacter, "solution.responsibleCharacter");
  c.solution.keyEvidence.forEach((k) => ref(evidence, k.evidenceId, "solution.keyEvidence"));
  if (!c.solution.sources.length) err("solution.sources: источники обязательны");

}
