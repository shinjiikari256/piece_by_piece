import { actions, useGame } from "../../../state/store";
import type { LiabilityKind } from "../../../../../../shared/case";
import { useState } from "react";
import { LEVEL, gradeOf, scorePercent, scoreTone } from "../common";
import { Folder } from "../../pages/screens";
import { Md } from "../../kit/md";
import { CaseCredit } from "../../kit/credit";
import { Downloads } from "./downloads";
import { optionLabel } from "./final";

const APPLIES = { yes: "да", no: "нет", possible: "возможно" } as const;
const APPLIES_TONE = { yes: "good", no: "bad", possible: "warn" } as const;
const LIABILITY_TITLE: Record<LiabilityKind, string> = {
  right: "Затронутое право",
  violation: "Нарушение права",
  administrative: "Административное правонарушение",
  criminal: "Преступление",
  civil: "Гражданско-правовой спор",
  disciplinary: "Дисциплинарное нарушение",
};

export function ResultScreen() {
  const caseFile = useGame((s) => s.caseFile)!;
  const score = useGame((s) => s.score)!;
  const wrongDeductions = useGame((s) => s.wrongDeductions);
  const solution = useGame((s) => s.debrief);
  const record = useGame((s) => s.record);

  const names: Record<string, string> = Object.fromEntries([...caseFile.characters.map((c) => [c.id, c.name]), ...caseFile.evidence.map((e) => [e.id, e.title])]);
  const [tab, setTab] = useState<"case" | "result" | "debrief" | "downloads">("result");
  const grade = gradeOf(scorePercent(score.total, score.max, score.timeBonus?.max ?? 0));

  return (
    <Folder
      tabs={[
        { id: "case", label: `ДЕЛО №${caseFile.number}` },
        { id: "result", label: "РЕЗУЛЬТАТ" },
        ...(solution ? [{ id: "debrief", label: "РАЗБОР ДЕЛА" }] : []),
        { id: "downloads", label: "СКАЧАТЬ" },
      ]}
      active={tab}
      onTab={(id) => setTab(id as typeof tab)}
      wide
      tall
      onClose={actions.leaveToSite}
    >
      <div className="result">
        {tab === "case" && (
          <section className="result-case">
            <h1 className="intro__title">{caseFile.title}</h1>
            {caseFile.introduction.split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <CaseCredit meta={caseFile.meta} />
          </section>
        )}
        {tab === "result" && (
          <>
            <header className="result__header">
              <div>
                <h1>{grade}</h1>
              </div>
              <div className="score" data-tone={scoreTone(score.total, score.max, score.timeBonus?.max)}>
                <span className="score__total">{score.total}</span>
                <span className="score__max">/{score.max}</span>
              </div>
            </header>

            <ul className="breakdown">
              {score.groups.map((g) => (
                <li key={g.label}>
                  <span>{g.label}</span>
                  <span className="breakdown__bar">
                    <span style={{ width: `${(g.points / g.max) * 100}%` }} />
                  </span>
                  <b>
                    {g.points}/{g.max}
                  </b>
                </li>
              ))}
              {score.timeBonus && (
                <li className={score.timeBonus.points ? "breakdown__bonus" : "breakdown__penalty"}>
                  <span>Бонус за время</span>
                  <span className="muted">
                    {score.timeBonus.missed === null
                      ? `уложились в ${score.timeBonus.minutes} мин`
                      : score.timeBonus.missed === "time"
                        ? `нужно было уложиться в ${score.timeBonus.minutes} мин`
                        : score.timeBonus.minScore > 0
                          ? `уложились, но бонус — только от ${score.timeBonus.minScore} баллов`
                          : "уложились, но баллов не набрано"}
                  </span>
                  <b>+{score.timeBonus.points}</b>
                </li>
              )}
              {score.hintPenalty > 0 && (
                <li className="breakdown__penalty">
                  <span>Подсказки</span>
                  <span />
                  <b>−{score.hintPenalty}</b>
                </li>
              )}
            </ul>

            <section>
              <h2>Ваши ответы</h2>
              {score.questions.map((r) => (
                <div key={r.question.id} className="answer">
                  <div className="answer__head">
                    <span>{r.question.prompt}</span>
                    <b>
                      {r.points}/{r.question.maxPoints}
                    </b>
                  </div>
                  {r.feedback.length === 0 && <p className="muted">Нет ответа.</p>}
                  {r.feedback.map((f) => (
                    <p key={f.optionId} className={f.points > 0 ? "good" : "bad"}>
                      <b>{optionLabel(r.question, f.optionId, names)}</b> — {f.text}
                    </p>
                  ))}
                </div>
              ))}
            </section>

            {wrongDeductions > 0 && <p className="muted">Ошибочных выводов при сопоставлении: {wrongDeductions}.</p>}
          </>
        )}

        {tab === "debrief" && solution && (
          <section className="debrief">
            <h3>Что произошло</h3>
            <Md text={solution.whatHappened} />
            <h3>Какое право затронуто</h3>
            <p>{solution.rightText}</p>
            <h3>Почему это нарушение</h3>
            <Md text={solution.explanation} />
            <h3>Какие доказательства это подтверждают</h3>
            <ul className="key-evidence">
              {solution.keyEvidence.map((k) => {
                const e = caseFile.evidence.find((x) => x.id === k.evidenceId)!;
                return (
                  <li key={k.evidenceId}>
                    <b>{e.title}</b> <span className="muted">(достоверность: {LEVEL[e.reliability]})</span> — {k.why}
                  </li>
                );
              })}
            </ul>
            <h3>Возможная юридическая квалификация</h3>
            <Md text={solution.legalQualification} />
            <table className="qual-table">
              <tbody>
                {solution.qualificationNotes.map((n) => (
                  <tr key={n.kind}>
                    <th scope="row">{LIABILITY_TITLE[n.kind]}</th>
                    <td className="applies" data-tone={APPLIES_TONE[n.applies]}>
                      {APPLIES[n.applies]}
                    </td>
                    <td>{n.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Источники</h3>
            <ul className="sources">
              {solution.sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="disclaimer">
              Учебный сценарий: юридические формулировки подготовлены для обучения и проверяются преподавателем. Квалификация в игре — возможная; вывод о виновности в преступлении может сделать только
              суд.
            </p>
          </section>
        )}

        {tab === "downloads" && <Downloads record={record} grade={grade} names={names} />}
      </div>
    </Folder>
  );
}

/**
 * Вкладка «Скачать»: грамота в PDF (от «Хорошей работы») и — если игрок не вошёл — файл результата для преподавателя.
 * Имя для грамоты: из учётной записи или из профиля браузера.
 */
