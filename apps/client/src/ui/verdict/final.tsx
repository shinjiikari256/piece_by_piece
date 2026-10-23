import { actions, useGame } from "../../state/store";
import type { PublicQuestion as Question } from "../../../../../shared/public-case";
import { useEffect, useRef, useState } from "react";
import { useArrowNav, useWindowKey } from "../hooks";
import { EvidenceCard, TabbedModal } from "../common";
import type { FolderTab } from "../folder";
import type { IconName } from "../icons";
import { Portrait } from "../panels";
import { resolveLook } from "../../game/art";

export function optionLabel(q: Question, optionId: string, names: Record<string, string>) {
  if (q.source === "inline") return q.options.find((o) => o.id === optionId)?.label ?? optionId;
  return names[optionId] ?? optionId;
}

const STEP_TITLES: Record<Question["category"], string> = {
  right: "Право",
  violation: "Нарушение",
  qualification: "Квалификация",
  responsible: "Виновный",
  evidence: "Доказательства",
};

const DECISION_TAB = "__decision__";
/** Варианты ответа на экране в порядке, в котором они показаны. */
const OPTION = "button.answer-opt, button.suspect, button.evidence-card";

export function FinalScreen() {
  const caseFile = useGame((s) => s.caseFile)!;
  const answers = useGame((s) => s.answers);
  // предметы (ключ, фонарь) уликами не считаются и в вопросах не участвуют
  const collectedAll = useGame((s) => s.progress.collected);
  const collected = collectedAll.filter((id) => caseFile.evidence.find((e) => e.id === id)?.kind !== "item");
  const questions = caseFile.questions;
  const [step, setStep] = useState(0); // questions.length — экран проверки
  const isReview = step === questions.length;
  const q = questions[step];
  const ready = questions.every((x) => (answers[x.id] ?? []).length > 0);
  const names: Record<string, string> = Object.fromEntries([...caseFile.characters.map((c) => [c.id, c.name]), ...caseFile.evidence.map((e) => [e.id, e.title])]);

  /** Варианты текущего вопроса в том виде, в каком их показываем. */
  const optionsOf = (x: Question): string[] => (x.source === "characters" ? caseFile.characters.map((c) => c.id) : x.source === "evidence" ? collected : x.options.map((o) => o.id));

  const toggle = (x: Question, id: string) => {
    const selected = answers[x.id] ?? [];
    if (x.kind === "single") actions.setAnswer(x.id, [id]);
    else actions.setAnswer(x.id, selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
  };

  // после смены шага фокус не должен пропадать (кнопка шага исчезла) — переходим к заголовку вопроса
  const main = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current) return void (opened.current = true); // при открытии фокус остаётся у окна: Tab начинается с вкладок
    const active = document.activeElement;
    if (active && active !== document.body && !active.classList.contains("backdrop")) return;
    main.current?.querySelector<HTMLElement>(".final2__q")?.focus({ preventScroll: true });
  }, [step]);

  useArrowNav(main, OPTION); // вариантов может быть больше девяти, а карточки лежат рядами: по ним ходим вертикальными стрелками
  useWindowKey((e) => {
    if (e.target instanceof Element && e.target.closest("input, textarea")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter" && q && !e.repeat) {
      // Enter на выбранном стрелками варианте: один ответ — выбрать его и перейти дальше; несколько — только дальше (выбор — пробелом)
      const items = [...(main.current?.querySelectorAll<HTMLElement>(OPTION) ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (at === -1) return; // фокус не на варианте: Enter нажимает основную кнопку окна
      e.preventDefault();
      const id = optionsOf(q)[at];
      if (q.kind === "single" && id) actions.setAnswer(q.id, [id]);
      setStep((v) => Math.min(questions.length, v + 1));
    } else if (q && /^[1-9]$/.test(e.key)) {
      const id = optionsOf(q)[Number(e.key) - 1];
      if (id) toggle(q, id);
    }
  });

  const isDone = (x: Question) => (answers[x.id] ?? []).length > 0;
  const tabs: FolderTab[] = [
    ...questions.map((x) => ({ id: x.id, label: STEP_TITLES[x.category], icon: (isDone(x) ? "check" : "circle") as IconName })),
    { id: DECISION_TAB, label: "Решение", icon: "scale" as IconName },
  ];
  const goTab = (id: string) =>
    setStep(
      id === DECISION_TAB
        ? questions.length
        : Math.max(
            0,
            questions.findIndex((x) => x.id === id),
          ),
    );

  return (
    <TabbedModal tabs={tabs} active={isReview ? DECISION_TAB : q.id} onTab={goTab} onClose={actions.backToInvestigation} tone="blue" className="final-window">
      <div className="final2__main col" ref={main}>
        <p className="sr-only" aria-live="polite">
          {q ? `Вопрос ${step + 1} из ${questions.length}. ${q.prompt}` : "Решение: все ответы"}
        </p>
        {q && (
          <>
            <p className="final2__kicker">
              Вопрос {step + 1} из {questions.length}
              {q.kind === "multi" && " · можно выбрать несколько"}
            </p>
            <h2 className="final2__q" id="final-q" tabIndex={-1}>
              {q.prompt}
            </h2>

            {q.source === "inline" && (
              <ol className="answers list-reset" aria-labelledby="final-q">
                {q.options.map((o, i) => {
                  const on = (answers[q.id] ?? []).includes(o.id);
                  return (
                    <li key={o.id}>
                      <button className="answer-opt" data-selected={on || undefined} aria-pressed={on} onClick={() => toggle(q, o.id)}>
                        <span className="answer-opt__key" aria-hidden="true">
                          {i < 9 ? i + 1 : ""}
                        </span>
                        <span className="answer-opt__text">
                          {o.label}
                          {o.mark && <small>{o.mark}</small>}
                        </span>
                        <span className="answer-opt__mark">{on ? "●" : "○"}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            {q.source === "characters" && (
              <div className="suspects" role="group" aria-labelledby="final-q">
                {caseFile.characters.map((c, i) => {
                  const on = (answers[q.id] ?? []).includes(c.id);
                  return (
                    <button key={c.id} className="option suspect" data-selected={on || undefined} aria-pressed={on} onClick={() => toggle(q, c.id)}>
                      <span className="suspect__key" aria-hidden="true">
                        {i < 9 ? i + 1 : ""}
                      </span>
                      <Portrait look={resolveLook(c)} />
                      <strong>{c.name}</strong>
                      <span className="muted">{c.position}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {q.source === "evidence" &&
              (collected.length === 0 ? (
                <p className="muted">В деле нет ни одной улики.</p>
              ) : (
                <>
                  <p className="muted" aria-live="polite">
                    Выбрано: {(answers[q.id] ?? []).length} из {collected.length}. Ложные показания снижают балл.
                  </p>
                  <div className="card-grid" role="group" aria-labelledby="final-q">
                    {collected.map((id) => (
                      <EvidenceCard key={id} evidence={caseFile.evidence.find((e) => e.id === id)!} selected={(answers[q.id] ?? []).includes(id)} onClick={() => toggle(q, id)} />
                    ))}
                  </div>
                </>
              ))}

            <div className="final2__nav">
              <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
                ← Назад
              </button>
              <button className="btn btn--primary" onClick={() => setStep(step + 1)}>
                {step === questions.length - 1 ? "К решению →" : "Далее →"}
              </button>
            </div>
          </>
        )}

        {isReview && (
          <>
            <p className="final2__kicker">Все ответы</p>
            <h2 className="final2__q" tabIndex={-1}>
              Решение
            </h2>
            <dl className="review-list">
              {questions.map((x, i) => (
                <div key={x.id} className={isDone(x) ? "" : "is-missing"}>
                  <dt>
                    {x.prompt}
                    <button className="link-btn" onClick={() => setStep(i)}>
                      изменить
                    </button>
                  </dt>
                  <dd>
                    {isDone(x)
                      ? (answers[x.id] ?? []).map((id) => (
                          <span key={id} className="review-chip">
                            {optionLabel(x, id, names)}
                          </span>
                        ))
                      : "Нет ответа"}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="final2__nav">
              <button className="btn" onClick={() => setStep(step - 1)}>
                ← Назад
              </button>
              <button className="btn btn--primary btn--big" disabled={!ready} onClick={actions.submit}>
                Вынести решение
              </button>
            </div>
            {!ready && <p className="muted">Ответьте на все вопросы.</p>}
          </>
        )}
      </div>
    </TabbedModal>
  );
}
