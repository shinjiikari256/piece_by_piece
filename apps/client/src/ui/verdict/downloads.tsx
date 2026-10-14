import { siteUrl } from "../router";
import { useGame } from "../../state/store";
import { useEffect, useRef, useState } from "react";
import { scoreTone } from "../common";
import { useAccount } from "../../state/account";
import { downloadCertificate, downloadResultPdf, drawCertificate, drawResultPages, type CertificateData, type ResultDocData } from "../documents";
import { GAME_VERSION, OFFLINE } from "../../env";
import { Alert } from "../alert";
import { Icon } from "../icons";
import { readProfile, writeProfile, type ResultRecord } from "../../state/profile";
import { downloadResult } from "../../state/result-file";

export function Downloads({ record, grade, names }: { record: ResultRecord | null; grade: string; names: Record<string, string> }) {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  const signedIn = server === "online" && !!me;
  const [profile, setProfile] = useState(readProfile);
  const [tried, setTried] = useState(false);
  const edit = (patch: Partial<typeof profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    writeProfile(next);
  };
  const caseFile = useGame((s) => s.caseFile)!;
  const score = useGame((s) => s.score)!;
  // чужое прохождение (преподаватель открыл результат студента) — документы на имя владельца
  const owner = record?.owner && !(signedIn && record.owner.id === me!.id) ? record.owner : null;
  const tone = scoreTone(score.total, score.max, score.timeBonus?.max);
  const good = tone === "good";
  const cert: CertificateData = {
    name: owner ? owner.fullName : signedIn ? me!.fullName : profile.name,
    group: owner ? owner.group : signedIn ? me!.group?.name : profile.group,
    caseNumber: caseFile.number,
    caseTitle: caseFile.title,
    total: score.total,
    max: score.max,
    grade,
    tone,
    date: new Date(record?.at ?? Date.now()),
  };
  const missingName = !cert.name.trim();
  const nameInput = useRef<HTMLInputElement>(null);
  /** Скачать, если ФИО указано; иначе — фокус на поле и подсказка. */
  const guard = (run: () => void) => () => {
    setTried(true);
    if (missingName) nameInput.current?.focus();
    else run();
  };
  const tb = score.timeBonus;
  const resultDoc: ResultDocData = {
    ...cert,
    minutes: record?.input?.elapsedMs == null ? null : Math.max(1, Math.round(record.input.elapsedMs / 60_000)),
    hintsUsed: record?.hintsUsed ?? 0,
    hintPenalty: score.hintPenalty,
    wrongDeductions: record?.wrongDeductions ?? 0,
    timeBonus: !tb ? null : tb.points > 0 ? `+${tb.points}` : "0",
    sections: score.groups,
    answers: score.questions.map((q) => ({
      prompt: q.question.prompt,
      points: q.points,
      max: q.question.maxPoints,
      chosen: q.feedback.map((f) => ({
        label: q.question.options.find((o) => o.id === f.optionId)?.label || names[f.optionId] || f.optionId,
        good: f.points > 0,
        text: f.text,
      })),
    })),
    gameVersion: record?.gameVersion ?? GAME_VERSION,
    source: OFFLINE ? "офлайн-версия" : "",
  };

  return (
    <section className="downloads">
      {!signedIn && !owner && (
        <div className="downloads__who">
          <label className={`labeled ${tried && missingName ? "is-invalid" : ""}`}>
            <span>ФИО</span>
            <input ref={nameInput} value={profile.name} onChange={(e) => edit({ name: e.target.value })} placeholder="Иванова Анна Сергеевна" />
          </label>
          <label className="labeled">
            <span>Группа</span>
            <input value={profile.group} onChange={(e) => edit({ group: e.target.value })} placeholder="ЮР-201" />
          </label>
        </div>
      )}
      {EMBEDDED_BROWSER && <EmbeddedBrowserNote />}
      {tried && missingName && <Alert>Укажите ФИО — без него грамоту и результат не выдать.</Alert>}

      <div className="downloads__grid">
        {/* грамота — только за «Хорошую работу» и выше; иначе карточки нет вовсе */}
        {good && (
          <article className="download-card">
            <CertificatePreview data={cert} />
            <div>
              <h3>Грамота</h3>
              <p className="muted">Лист A4 в PDF — можно распечатать.</p>
              <button className="btn btn--primary" onClick={guard(() => void downloadCertificate(cert))}>
                <Icon name="save" size={15} /> Скачать грамоту
              </button>
            </div>
          </article>
        )}

        <article className="download-card">
          <ResultPreview data={resultDoc} />
          <div>
            <h3>Результат расследования</h3>
            <p className="muted">PDF с оценкой, разделами и вашими ответами: по какому делу, кому выдан, когда и где пройдено.</p>
            <button
              className="btn btn--primary"
              onClick={guard(() => void downloadResultPdf(resultDoc))}
            >
              <Icon name="save" size={15} /> Скачать результат
            </button>
          </div>
        </article>

        {!signedIn && !owner && record?.input && (
          <article className="download-card">
            <div className="download-card__icon">
              <Icon name="evidence" size={40} />
            </div>
            <div>
              <h3>Файл для преподавателя</h3>
              <p className="muted">
                Вы проходили дело без входа, поэтому преподаватель не видит этот результат. Скачайте файл и передайте ему.
                {server === "online" && " В следующий раз войдите перед прохождением — результат сохранится сам."}
              </p>
              <button
                className="btn"
                onClick={guard(() => downloadResult(record, profile))}
              >
                <Icon name="save" size={15} /> Скачать файл (.json)
              </button>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

/**
 * Встроенный браузер VS Code (Electron) не сохраняет файлы, созданные страницей, — скачивание молча не срабатывает.
 */
const EMBEDDED_BROWSER = typeof navigator !== "undefined" && /\b(Electron|Code)\//.test(navigator.userAgent);

function EmbeddedBrowserNote() {
  const url = siteUrl();
  return (
    <Alert tone="warn" icon as="div" className="embedded-note">
      <b>Этот браузер не умеет сохранять файлы</b> (встроенный браузер VS Code). Откройте игру в обычном браузере — Chrome, Firefox,
      Яндекс — и скачайте там: <code>{url}</code>{" "}
      <button className="linkbtn" onClick={() => void navigator.clipboard?.writeText(url)}>
        скопировать адрес
      </button>
    </Alert>
  );
}

/** Первый лист PDF результата в миниатюре. */
function ResultPreview({ data }: { data: ResultDocData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(data);
  useEffect(() => {
    let alive = true;
    void document.fonts.ready.then(() => {
      const c = ref.current;
      if (!alive || !c) return;
      const [first] = drawResultPages(data);
      c.width = first.width;
      c.height = first.height;
      c.getContext("2d")!.drawImage(first, 0, 0);
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="certificate-preview" aria-label="Предпросмотр результата" />;
}

function CertificatePreview({ data }: { data: CertificateData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(data);
  useEffect(() => {
    let alive = true;
    void document.fonts.ready.then(() => alive && ref.current && drawCertificate(ref.current, data));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="certificate-preview" aria-label="Предпросмотр грамоты" />;
}
