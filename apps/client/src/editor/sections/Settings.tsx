import type { CaseFile } from "../../../../../shared/case";
import { timelineEnabled } from "../../../../../shared/events";
import { editor, useEditor } from "../state";

export function SettingsSection() {
  const draft = useEditor((s) => s.draft);
  const on = draft.settings?.timeline !== false;
  return (
    <section className="ed__panel ed__panel--narrow">
      <h2>Настройки</h2>
      <p className="muted">Возможности дела: хронология и бонус за время. События остаются в деле, даже когда хронология выключена.</p>
      <label className="ef ef--bool">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => editor.update((d) => ({ ...d, settings: { ...d.settings, timeline: e.target.checked } }), "settings")}
        />
        Хронология в журнале
      </label>
      <TimeBonus draft={draft} />
      {on && !timelineEnabled(draft) && <p className="muted">Вкладка появится, когда в деле будет хотя бы одно событие.</p>}
    </section>
  );
}

/** Бонус за время: три числа в одну строку и общее пояснение. */
function TimeBonus({ draft }: { draft: CaseFile }) {
  const tb = draft.timeBonus;
  const set = (next: CaseFile["timeBonus"]) => editor.update((d) => ({ ...d, timeBonus: next }), "general");
  if (!tb)
    return (
      <div className="ef__bonus">
        <button className="ef__add-optional" onClick={() => set({ minutes: 15, points: 10 })}>
          + Бонус за время
        </button>
      </div>
    );
  const num = (v: string) => Math.max(0, Math.round(Number(v)));
  return (
    <div className="ef ef__bonus ef__bonus--on">
      <span className="ef__label">
        Бонус за время
        <span className="ef__hint">
          Уложился в указанное время и набрал не меньше порога — получает баллы сверх суммы за вопросы. Порог пустой — бонус при любом результате выше нуля.
          Время идёт с начала расследования.
        </span>
      </span>
      <div className="ef__triple">
        <label className="labeled">
          <span>Минут</span>
          <input type="number" min={1} value={tb.minutes} onChange={(e) => set({ ...tb, minutes: Math.max(1, num(e.target.value)) })} />
        </label>
        <label className="labeled">
          <span>Баллов бонуса</span>
          <input type="number" min={0} value={tb.points} onChange={(e) => set({ ...tb, points: num(e.target.value) })} />
        </label>
        <label className="labeled">
          <span>Порог успеха, баллов</span>
          <input
            type="number"
            min={0}
            value={tb.minScore ?? ""}
            onChange={(e) => {
              const { minScore: _m, ...rest } = tb;
              set(e.target.value === "" ? rest : { ...rest, minScore: num(e.target.value) });
            }}
          />
        </label>
        <button className="ef__remove-optional" title="Убрать бонус" onClick={() => set(undefined)}>
          ✕
        </button>
      </div>
    </div>
  );
}
