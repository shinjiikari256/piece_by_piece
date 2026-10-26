import { type Condition, type Effect } from "../../../../../shared/case";
import { flagOfEffect } from "../../../../../shared/conditions";
import { effectSites } from "../../../../../shared/effect-sites";
import { isRangeOrdered, parseEventTime } from "../../../../../shared/events";
import type { Ctx } from "./context";

/** Улики: приложения-ссылки, связанные персонажи и события. */
export function checkEvidence(ctx: Ctx) {
  const { c, err, ref, characters, events } = ctx;
  for (const e of c.evidence)
    e.attachments?.forEach((a, i) => {
      if (a.kind === "link" && !/^https?:\/\//i.test(a.src)) err(`evidence ${e.id}: приложение №${i + 1} — адрес ссылки должен начинаться с http:// или https://`);
    });
  for (const e of c.evidence) {
    e.relatedCharacters.forEach((id) => ref(characters, id, `evidence ${e.id}.relatedCharacters`));
    e.relatedEvents.forEach((id) => ref(events, id, `evidence ${e.id}.relatedEvents`));
  }

}

/** Диалоги: ссылки на узлы, персонажей, условия, предъявления. */
export function checkDialogues(ctx: Ctx) {
  const { c, err, unique, ref, characters, evidence, checkCondition } = ctx;
  // Диалоги
  for (const d of c.dialogues) {
    ref(characters, d.characterId, `dialogue ${d.id}`);
    const nodes = unique(
      `dialogue ${d.id} nodes`,
      d.nodes.map((n) => n.id),
    );
    ref(nodes, d.startNodeId, `dialogue ${d.id}.startNodeId`);
    for (const n of d.nodes) {
      const where = `dialogue ${d.id}/${n.id}`;
      if (n.speaker) ref(characters, n.speaker, `${where}.speaker`);
      if (!n.choices.length) err(`${where}: нет вариантов ответа`);
      unique(
        `${where} choices`,
        n.choices.map((ch) => ch.id),
      );
      for (const ch of n.choices) {
        if (ch.next !== null) ref(nodes, ch.next, `${where}/${ch.id}.next`);
        checkCondition(ch.requires, `${where}/${ch.id}.requires`);
      }
      unique(
        `${where} presentations`,
        (n.presentations ?? []).map((p) => p.id),
      );
      for (const p of n.presentations ?? []) {
        if (p.next !== null) ref(nodes, p.next, `${where}/present:${p.id}.next`);
        checkCondition(p.requires, `${where}/present:${p.id}.requires`);
        p.evidenceIds.forEach((id) => ref(evidence, id, `${where}/present:${p.id}.evidenceIds`));
      }
      n.textVariants?.forEach((tv, i) => checkCondition(tv.requires, `${where}.textVariants[${i}].requires`));
    }
  }

}

/** Эффекты: ссылки внутри них; улики без источника недостижимы. */
export function checkEffectSites(ctx: Ctx) {
  const { c, err, evidence, obtainable, checkEffects } = ctx;
  // эффекты: ссылки внутри них и источники улик (реплики, варианты, сопоставления, осмотр, области)
  for (const site of effectSites(c)) {
    checkEffects(site.effects, site.where);
    site.effects.forEach((e) => e.type === "addEvidence" && obtainable.add(e.evidenceId));
  }

  for (const id of evidence) {
    if (!obtainable.has(id)) err(`evidence ${id}: недостижима — нет ни объекта, ни эффекта addEvidence`);
  }

}

/** Сопоставления: входы, верный вариант, цепочки без циклов. */
export function checkDeductions(ctx: Ctx) {
  const { c, err, unique, evidence, itemIds, deductions, checkCondition } = ctx;
  // Сопоставления
  for (const d of c.deductions) {
    checkCondition(d.requires, `deduction ${d.id}.requires`);
    if (d.requires?.deductions?.includes(d.id)) err(`deduction ${d.id}: условие доступности требует само это сопоставление — оно никогда не станет доступным`);
    // вход — улика или уже установленный факт (так строятся цепочки)
    d.evidenceIds.forEach((id) => {
      if (!evidence.has(id) && !deductions.has(id)) err(`deduction ${d.id}: неизвестная ссылка «${id}»`);
      if (evidence.has(id) && deductions.has(id)) err(`deduction ${d.id}: «${id}» — и улика, и вывод; переименуйте одно из них`);
      if (itemIds.has(id)) err(`deduction ${d.id}: «${id}» — предмет, а не улика; в сопоставление берут улики, показания и выводы`);
    });
    if (d.evidenceIds.length !== 2) err(`deduction ${d.id}: сопоставляются ровно два материала`);
    if (d.evidenceIds.includes(d.id)) err(`deduction ${d.id}: вывод не может опираться сам на себя`);
    if (d.options.filter((o) => o.correct).length !== 1) err(`deduction ${d.id}: должен быть ровно один верный вариант`);
  }
  // цепочки без циклов: факт не может зависеть от себя через другие
  const deps = new Map(c.deductions.map((d) => [d.id, d.evidenceIds.filter((id) => deductions.has(id))]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const cyclic = (deps.get(id) ?? []).some(visit);
    visiting.delete(id);
    done.add(id);
    return cyclic;
  };
  for (const d of c.deductions) if (visit(d.id)) err(`deduction ${d.id}: цепочка сопоставлений замкнута в круг`);
  const combos = c.deductions.map((d) => [...d.evidenceIds].sort().join("+"));
  unique("deductions (наборы улик)", combos);
}

/** У каждого используемого флага есть название. */
export function checkFlags(ctx: Ctx) {
  const { c, err, unique } = ctx;
  // у каждого флага — русское название
  const named = unique(
    "flags",
    (c.flags ?? []).map((f) => f.id),
  );
  const usedFlags = new Set<string>();
  const addFlagOf = (e: Effect) => {
    const f = flagOfEffect(e);
    if (f) usedFlags.add(f.flag);
  };
  const condFlags = (cond?: Condition): void => {
    [...(cond?.flags ?? []), ...(cond?.notFlags ?? [])].forEach((f) => usedFlags.add(f));
    cond?.anyOf?.forEach(condFlags);
    cond?.allOf?.forEach(condFlags);
  };
  for (const dl of c.dialogues)
    for (const n of dl.nodes) {
      n.choices.forEach((ch) => condFlags(ch.requires));
      n.textVariants?.forEach((tv) => condFlags(tv.requires));
    }
  effectSites(c).forEach((site) =>
    site.effects.forEach((e) => {
      addFlagOf(e);
      condFlags(e.requires);
    }),
  );
  c.locations.forEach((l) =>
    l.npcs.forEach((n) => {
      condFlags(n.requires);
      n.dialogues.forEach((nd) => condFlags(nd.requires));
    }),
  );
  c.locations.forEach((l) => l.zones.forEach((z) => z.actions.forEach((a) => condFlags(a.requires))));
  c.locations.forEach((l) => l.objects.forEach((o) => o.states?.forEach((st) => condFlags(st.when))));
  c.events.forEach((ev) => condFlags(ev.requires));
  for (const f of usedFlags) if (!named.has(f)) err(`flags: у флага «${f}» нет названия — добавьте его в разделе «Переменные»`);
}

/** Закон: у норм и пояснений есть заголовки. */
export function checkLaw(ctx: Ctx) {
  const { c, err } = ctx;
  c.lawReference?.basis.forEach((x, i) => x.title.trim() || err(`lawReference: у нормы №${i + 1} нет названия`));
  c.lawReference?.notes.forEach((x, i) => x.title.trim() || err(`lawReference: у пояснения №${i + 1} нет заголовка`));
}

/** Подсказки уровней 1–3. */
export function checkHints(ctx: Ctx) {
  const { c, err, checkCondition } = ctx;
  // Подсказки
  const levels = c.hints.map((h) => h.level).sort();
  if (levels.join(",") !== "1,2,3") err("hints: нужны подсказки уровней 1, 2 и 3");
  c.hints.forEach((h) => checkCondition(h.requires, `hint ${h.level}.requires`));

}

/** События хронологии: условия и время. */
export function checkEvents(ctx: Ctx) {
  const { c, err, checkCondition } = ctx;
  // События хронологии
  for (const ev of c.events) {
    checkCondition(ev.requires, `event ${ev.id}.requires`);
    if (!parseEventTime(ev.at)) err(`event ${ev.id}: такой даты или времени нет — «${ev.at}»`);
    if (ev.until !== undefined) {
      if (!parseEventTime(ev.until)) err(`event ${ev.id}: такой даты или времени нет — «${ev.until}»`);
      else if (parseEventTime(ev.at) && !isRangeOrdered(ev.at, ev.until)) err(`event ${ev.id}: конец («${ev.until}») раньше начала («${ev.at}»)`);
    }
  }

}
