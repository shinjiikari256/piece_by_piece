import type { CaseFile, Condition, Effect } from "../../../../shared/case";
import { flagOfEffect, initialEnums } from "../../../../shared/conditions";
import { effectSites } from "../../../../shared/effect-sites";

/**
 * Предупреждения: дело корректно и запустится, но что-то, скорее всего, недоделано. Не блокируют сохранение и запуск.
 * Сообщения начинаются как у ошибок (`dialogue …`, `location …/zone …`, `flag …`) — `editor/errors.ts` ведёт по ним к месту.
 */
export function caseWarnings(c: CaseFile): string[] {
  const out: string[] = [];

  // диалог, который никто не запустит
  const launched = new Set<string>();
  for (const l of c.locations) {
    for (const n of l.npcs) {
      launched.add(n.dialogueId);
      n.dialogues.forEach((d) => launched.add(d.dialogueId));
    }
    for (const z of l.zones) z.actions.forEach((a) => a.kind === "dialogue" && launched.add(a.dialogueId));
  }
  effectSites(c).forEach((site) => site.effects.forEach((e) => e.type === "startDialogue" && launched.add(e.dialogueId)));
  for (const d of c.dialogues) if (!launched.has(d.id)) out.push(`dialogue ${d.id}: никто не запускает — подключите диалог к человеку на карте или к области`);

  // реплика, где у всех вариантов есть условие: если ни одно не выполнено, игра предложит только «Закончить разговор»
  for (const d of c.dialogues)
    for (const n of d.nodes)
      if (!n.auto && n.choices.length && n.choices.every((ch) => ch.requires && Object.keys(ch.requires).length))
        out.push(`dialogue ${d.id}/${n.id}: у всех вариантов есть условие — если ни одно не выполнится, останется только «Закончить разговор»; добавьте вариант без условия`);

  // узлы-переходы: без варианта без условия разговор при невыполненных условиях закончится; цепочка переходов по кругу
  for (const d of c.dialogues) {
    for (const n of d.nodes) {
      if (!n.auto) continue;
      if (!n.choices.some((ch) => !ch.requires || !Object.keys(ch.requires).length))
        out.push(`dialogue ${d.id}/${n.id}: у перехода нет варианта без условия — если ни одно условие не выполнится, разговор закончится`);
    }
    const autoNext = (id: string) => (d.nodes.find((n) => n.id === id)?.auto ? d.nodes.find((n) => n.id === id)!.choices.flatMap((ch) => (ch.next ? [ch.next] : [])) : []);
    for (const n of d.nodes) {
      if (!n.auto) continue;
      const seen = new Set<string>();
      const stack = [n.id];
      let loops = false;
      while (stack.length && !loops) {
        for (const next of autoNext(stack.pop()!)) {
          if (next === n.id) loops = true;
          else if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      if (loops) out.push(`dialogue ${d.id}/${n.id}: переходы идут по кругу — игра остановит цепочку через 20 шагов`);
    }
  }

  // область без действий
  for (const l of c.locations) for (const z of l.zones) if (!z.actions.length) out.push(`location ${l.id}/zone ${z.id}: у области нет действий — она ничего не делает`);

  // флаги: условие ждёт флаг, который никто не ставит (обратное — флаг поставлен, но не проверяется — не предупреждаем: так пишут «история» дела)
  const set = new Set<string>((c.flags ?? []).filter((f) => f.initial).map((f) => f.id)); // начальные флаги стоят с самого начала
  const effects = (list: Effect[]) =>
    list.forEach((e) => {
      const f = flagOfEffect(e);
      if (f && f.action !== "off") set.add(f.flag);
      if (e.type === "changeVariable" && !e.valueId) changed.add(e.variableId);
      if (e.type === "changeVariable" && e.action === "assign" && e.valueId) assigned.add(`${e.variableId}:${e.valueId}`);
    });
  // значения перечислений: условие ждёт значение, которое ни один эффект не выбирает и которое не начальное
  const assigned = new Set<string>(initialEnumPairs(c));
  const changed = new Set<string>(); // счётчики, которые меняет хоть один эффект
  const needsValue = new Set<string>();
  const needsSetting = new Set<string>(); // проверяемые «флаг стоит» — их обязательно кто-то ставит
  const counterRanges: NonNullable<Condition["counters"]> = [];
  const positive = (cnd: Condition | undefined): void => {
    cnd?.flags?.forEach((f) => needsSetting.add(f));
    cnd?.enums?.forEach((r) => r.in?.forEach((v) => needsValue.add(`${r.enumId}:${v}`)));
    cnd?.counters?.forEach((r) => counterRanges.push(r));
    cnd?.anyOf?.forEach(positive);
    cnd?.allOf?.forEach(positive);
  };
  effectSites(c).forEach((site) => {
    effects(site.effects);
    site.effects.forEach((e) => positive(e.requires));
  });
  for (const d of c.dialogues)
    for (const n of d.nodes) {
      n.choices.forEach((ch) => positive(ch.requires));
      n.textVariants?.forEach((tv) => positive(tv.requires));
    }
  c.hints.forEach((h) => positive(h.requires));
  c.events.forEach((ev) => positive(ev.requires));
  if (c.settings?.timelineYear === undefined && c.events.some((ev) => ev.showInTimeline && (!/^\d{4}-/.test(ev.at) || (ev.until && !/^\d{4}-/.test(ev.until)))))
    out.push("settings: у части событий нет года — задайте базовый год в «Настройках», иначе он подберётся сам по самому раннему событию");
  c.deductions.forEach((x) => positive(x.requires));
  for (const l of c.locations) {
    l.npcs.forEach((n) => {
      positive(n.requires);
      n.dialogues.forEach((d) => positive(d.requires));
    });
    l.zones.forEach((z) =>
      z.actions.forEach((a) => {
        positive(a.requires);
      }),
    );
  }
  for (const f of needsSetting) if (!set.has(f)) out.push(`flag ${f}: условия ждут этот флаг, но ни один эффект его не ставит — то, что за ним, недостижимо`);
  for (const key of needsValue)
    if (!assigned.has(key)) out.push(`enum ${key.split(":")[0]}: условия ждут значение «${key.split(":")[1]}», но ни один эффект его не выбирает — то, что за ним, недостижимо`);

  // счётчики: условие вне границ счётчика или счётчик, который никто не меняет, а условие требует другого значения
  const counters = new Map((c.counters ?? []).map((k) => [k.id, k]));
  const seenCounter = new Set<string>();
  for (const r of counterRanges) {
    const k = counters.get(r.counterId);
    if (!k) continue;
    const reach = (r.min !== undefined && k.max !== undefined && r.min > k.max) || (r.max !== undefined && k.min !== undefined && r.max < k.min);
    const start = k.initial ?? 0;
    const stuck = !changed.has(k.id) && ((r.min !== undefined && r.min > start) || (r.max !== undefined && r.max < start));
    const text = reach
      ? `условие требует значение вне границ счётчика (${k.min ?? "−∞"}…${k.max ?? "∞"}) — то, что за ним, недостижимо`
      : stuck
        ? `никакой эффект не меняет счётчик (всегда ${start}), а условие требует другого значения — то, что за ним, недостижимо`
        : "";
    if (text && !seenCounter.has(`${k.id}:${text}`)) {
      seenCounter.add(`${k.id}:${text}`);
      out.push(`counter ${k.id}: ${text}`);
    }
  }
  return out;
}

/** Пары «перечисление:значение», которые действуют с самого начала. */
function initialEnumPairs(c: CaseFile): string[] {
  return Object.entries(initialEnums(c.enums)).map(([id, v]) => `${id}:${v}`);
}
