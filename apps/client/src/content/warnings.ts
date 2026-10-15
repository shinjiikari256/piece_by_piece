import type { CaseFile, Condition, Effect } from "../../../../shared/case";

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
  for (const d of c.dialogues) if (!launched.has(d.id)) out.push(`dialogue ${d.id}: никто не запускает — подключите диалог к человеку на карте или к области`);

  // область без действий
  for (const l of c.locations) for (const z of l.zones) if (!z.actions.length) out.push(`location ${l.id}/zone ${z.id}: у области нет действий — она ничего не делает`);

  // флаги: условие ждёт флаг, который никто не ставит (обратное — флаг поставлен, но не проверяется — не предупреждаем: так пишут «история» дела)
  const set = new Set<string>((c.flags ?? []).filter((f) => f.initial).map((f) => f.id)); // начальные флаги стоят с самого начала
  const effects = (list: Effect[]) => list.forEach((e) => e.type === "setFlag" && set.add(e.flag));
  const needsSetting = new Set<string>(); // проверяемые «флаг стоит» — их обязательно кто-то ставит
  const positive = (cnd: Condition | undefined): void => {
    cnd?.flags?.forEach((f) => needsSetting.add(f));
    cnd?.anyOf?.forEach(positive);
  };
  for (const d of c.dialogues)
    for (const n of d.nodes) {
      effects(n.effects);
      n.choices.forEach((ch) => {
        positive(ch.requires);
      });
    }
  c.deductions.forEach((x) => effects(x.effects));
  for (const l of c.locations) {
    l.doors.forEach((d) => {
      positive(d.requires);
    });
    l.npcs.forEach((n) =>
      n.dialogues.forEach((d) => {
        positive(d.requires);
      }),
    );
    l.zones.forEach((z) =>
      z.actions.forEach((a) => {
        if (a.kind === "effects") effects(a.effects);
        positive(a.requires);
      }),
    );
  }
  for (const f of needsSetting) if (!set.has(f)) out.push(`flag ${f}: условия ждут этот флаг, но ни один эффект его не ставит — то, что за ним, недостижимо`);
  return out;
}
