import { formatDate } from "../../util/format";
import type { CaseFile } from "../../../../../shared/case";
import { editor, useEditor } from "../state";
import { ObjectFields } from "../SchemaForm";
import { SCHEMA } from "../shared";

export function GeneralSection() {
  const draft = useEditor((s) => s.draft);
  return (
    <section className="ed__panel ed__panel--narrow">
      <h2>Основное</h2>
      <p className="muted">
        id дела должен быть уникальным: под ним дело появится в игре. Когда дело готово, включите «Показывать в списке дел».
        {draft.updatedAt && ` Последнее изменение: ${formatDate(draft.updatedAt, true)}.`}
      </p>
      <ObjectFields
        schema={SCHEMA}
        value={draft}
        ctx={{ draft }}
        only={["id", "number", "title", "tagline", "introduction", "difficulty"]}
        onChange={(v) => editor.update(() => v as CaseFile, "general")}
      />
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
