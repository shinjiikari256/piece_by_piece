import type { CaseFile } from "../../../../../shared/case";
import { editor, useEditor } from "../state";

export function SettingsSection() {
  const draft = useEditor((s) => s.draft);
  return (
    <section className="ed__panel ed__panel--narrow">
      <h2>Настройки</h2>
      <p className="muted">Базовый год событий и бонус за время. Что показывать в хронологии, отмечается у каждого события.</p>
      <label className="labeled">
        <span>Базовый год событий</span>
        <input
          type="number"
          min={1}
          max={9999}
          value={draft.settings?.timelineYear ?? ""}
          placeholder="по самому раннему событию"
          onChange={(e) => {
            const { timelineYear: _y, ...rest } = draft.settings ?? {};
            const n = Math.round(Number(e.target.value));
            editor.update((d) => ({ ...d, settings: e.target.value === "" || !(n >= 1) ? rest : { ...rest, timelineYear: Math.min(9999, n) } }), "settings");
          }}
        />
        <span className="ef__hint">Год для событий, у которых он не указан. На хронологии не показывается.</span>
      </label>
      <TimeBonus draft={draft} />
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
          Уложился в указанное время и набрал не меньше порога — получает баллы сверх суммы за вопросы. Порог пустой — бонус при любом результате выше нуля. Время идёт с начала расследования.
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
