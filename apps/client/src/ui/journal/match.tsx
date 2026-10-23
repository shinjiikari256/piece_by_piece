import { useEffect, useRef, useState } from "react";
import { useArrowNav, useWindowKey } from "../hooks";
import { actions, useGame } from "../../state/store";
import type { PublicDeduction as Deduction } from "../../../../../shared/public-case";
import { FactCard, kindTitle } from "../common";
import { Icon } from "../icons";
import { useCase } from "./index";

// ---------- Сопоставление (панель в «Материалах») ----------

type MatchState = { step: "pick" } | { step: "nothing" } | { step: "question"; deduction: Deduction; wrong?: string } | { step: "solved"; deduction: Deduction; feedback?: string };

export function MatchPanel({ picked, onRemove, onClear }: { picked: string[]; onRemove: (id: string) => void; onClear: () => void }) {
  const caseFile = useCase();
  const solved = useGame((s) => s.progress.deductions);
  const [state, setState] = useState<MatchState>({ step: "pick" });
  const root = useRef<HTMLElement>(null);
  // пока показаны варианты ответа, стрелки ходят по ним (у журнала при этом навигация по карточкам выключена), а цифра выбирает вариант (фокус — Enter нажимает)
  const OPTIONS = ".deduction__options .choice";
  useArrowNav(root, OPTIONS);
  useWindowKey((e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
    const option = root.current?.querySelectorAll<HTMLElement>(OPTIONS)[Number(e.key) - 1];
    if (!option) return;
    e.preventDefault();
    option.focus();
  });
  const pickedKey = picked.join("+");
  useEffect(() => setState({ step: "pick" }), [pickedKey]);
  // ключ карточки: id улики или «fact:<id сопоставления>»
  const info = (key: string) => {
    if (key.startsWith("fact:")) {
      const d = caseFile.deductions.find((x) => x.id === key.slice(5))!;
      return { type: "Вывод", title: d.title };
    }
    const e = caseFile.evidence.find((x) => x.id === key)!;
    return { type: kindTitle(e), title: e.title };
  };

  const compare = () => {
    const d = actions.findDeduction(picked.map((k) => k.replace(/^fact:/, "")));
    if (!d) setState({ step: "nothing" });
    else if (solved.includes(d.id)) setState({ step: "solved", deduction: d });
    else setState({ step: "question", deduction: d });
  };
  const answer = async (d: Deduction, optionId: string) => {
    const r = await actions.answerDeduction(d.id, optionId);
    if (!r) return;
    setState(r.correct ? { step: "solved", deduction: d, feedback: r.feedback } : { step: "question", deduction: d, wrong: r.feedback });
  };

  return (
    <section className="board board--compact" ref={root}>
      <div className="pins pins--pair">
        {picked.length === 2 && <span className="pins__string" style={{ left: "25%", width: "50%" }} />}
        {[0, 1].map((i) => {
          const id = picked[i];
          return (
            <div key={i} data-slot={i} className={`pin-slot ${id ? "is-filled" : ""}`}>
              {id ? (
                <div className="pinned">
                  <span className="pinned__pin" />
                  <button className="pinned__remove" onClick={() => onRemove(id)} aria-label="Открепить" title="Открепить">
                    <Icon name="close" size={14} />
                  </button>
                  <span className="pinned__type">{info(id).type}</span>
                  <strong>{info(id).title}</strong>
                </div>
              ) : (
                <span className="pin-slot__hint">{i === 0 ? "первый материал" : "второй материал"}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="board__result">
        {state.step === "pick" && (
          <>
            <p className="board__prompt">Выберите два материала или перетащите их в ячейки, чтобы сделать вывод. Сделанные выводы также можно использовать при сопоставлении.</p>
            <button className="btn btn--primary" disabled={picked.length < 2} onClick={compare}>
              Сопоставить
            </button>
          </>
        )}
        {state.step === "nothing" && (
          <>
            <p className="verdict" data-tone="bad">
              Эти материалы не складываются в вывод. Попробуйте другую комбинацию.
            </p>
            <button className="btn" onClick={onClear}>
              Очистить
            </button>
          </>
        )}
        {state.step === "question" && (
          <div className="deduction">
            <p className="deduction__q">{state.deduction.question}</p>
            <div className="deduction__options">
              {state.deduction.options.map((o, i) => (
                <button key={o.id} className="choice" onClick={() => answer(state.deduction, o.id)}>
                  <span className="choice__num">{i + 1}</span>
                  <span className="choice__text">{o.text}</span>
                </button>
              ))}
            </div>
            {state.wrong && (
              <p className="verdict" data-tone="bad">
                Не сходится. {state.wrong}
              </p>
            )}
          </div>
        )}
        {state.step === "solved" && (
          <div className="board__solved">
            <FactCard deduction={state.deduction} />
            {state.feedback && <p className="muted">{state.feedback}</p>}
            <button className="btn btn--primary" onClick={onClear}>
              Новое сопоставление
            </button>
          </div>
        )}
      </div>
      <p className="muted board__count">
        Установлено выводов: <b>{solved.length}</b> из {caseFile.deductions.length}
      </p>
    </section>
  );
}
