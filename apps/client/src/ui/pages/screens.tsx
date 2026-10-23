import "../components/case-stamps.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { caseRepository, type CaseSummary } from "../../content/repository";
import { actions, useGame } from "../../state/store";
import { formatSaveDate, isSaveOutdated, type SaveData } from "../../state/save-data";
import type { ResultRecord } from "../../state/result-record";
import { lastResultOf } from "../../state/result-record";
import { platform } from "../../state/platform";
import { useAccount } from "../../state/account";
import { usePlatformValue } from "../../state/platform-hooks";
import { useScrollKeys } from "../lib/hooks";
import { Alert } from "../kit/alert";
import { Loader } from "../kit/loader";
import { percentOf } from "../../util/format";
import { FolderTabs, type FolderTab } from "../kit/folder";
import { DIFFICULTY, TabbedModal, scoreTone, useEnterPrimary } from "../components/common";
import { DEFAULT_BONUS_SCORE } from "../../../../../shared/scoring";
import { embeddedCases } from "../../env";
import { creditText } from "../kit/credit";

export function useCaseList() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const signedIn = useAccount((a) => a.me?.id ?? null);
  useEffect(() => {
    caseRepository.list().then(setCases);
  }, [signedIn]);
  return cases;
}

export async function openCase(id: string, eventId?: number) {
  actions.openCase(await caseRepository.open(id, eventId));
}

/** Сразу продолжить начатое расследование (с устаревшим сохранением — экран дела с предупреждением). */
export async function resumeCase(id: string) {
  await actions.resume(await caseRepository.open(id));
}

/** Последний сохранённый результат дела — сразу на экран результата. */
export async function openResult(caseId: string, record?: ResultRecord) {
  record ??= lastResultOf(await platform().results.list(), caseId);
  if (!record) return;
  await actions.showResult(await caseRepository.open(caseId), record);
}

/** Насколько продвинулось расследование: найденные улики и установленные выводы от всех, в процентах. */
export function progressPercent(save: SaveData, evidence: number, deductions: number): number {
  return Math.min(100, percentOf(save.progress.collected.length + save.progress.deductions.length, evidence + deductions));
}

/**
 * Каркас «папка с делом»: корешок «назад» и вкладка с названием — сверху слева,
 * содержимое — на листе, действия — внизу листа. Одинаково на всех экранах до игры.
 */
export function Folder({
  tab,
  tabs,
  active,
  onTab,
  back,
  stamp,
  actions: footer,
  children,
  wide,
  tall,
  onClose,
}: {
  tab?: string;
  /** Несколько вкладок-закладок вместо одной надписи. */
  tabs?: FolderTab[];
  active?: string;
  onTab?: (id: string) => void;
  back?: { label: string; onClick: () => void };
  stamp?: string;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  /** Во всю высоту экрана (результат): содержимое прокручивается внутри листа. */
  tall?: boolean;
  /** Вкладка-крестик справа: закрыть окно-папку. */
  onClose?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEnterPrimary(ref);
  useScrollKeys(ref);
  return (
    <main className="menu" ref={ref}>
      <div className={`folder ${wide ? "folder--wide" : ""} ${tabs ? "folder--tabbed" : ""} ${tall ? "folder--tall" : ""}`}>
        <FolderTabs tabs={tabs ?? (tab ? [{ id: "tab", label: tab }] : [])} active={tabs ? (active ?? "") : "tab"} onTab={onTab} back={back} onClose={onClose} />
        <div className="folder__sheet paper">
          {stamp && <div className="stamp">{stamp}</div>}
          {/* у папки с закладками высота постоянная — длинное содержимое прокручивается внутри */}
          {tabs ? <div className="folder__content">{children}</div> : children}
          {footer && <div className="folder__actions">{footer}</div>}
        </div>
      </div>
    </main>
  );
}

export function CaseList({ cases }: { cases: CaseSummary[] | null }) {
  const [saveList] = usePlatformValue(() => platform().saves.list(), [] as SaveData[]);
  const [results] = usePlatformValue(() => platform().results.list(), [] as ResultRecord[]);
  const saves = new Map(saveList.map((s) => [s.caseId, s]));
  const online = useAccount((a) => a.server === "online");
  const signedIn = useAccount((a) => !!a.me);
  return (
    <>
      {!cases && <Loader label="Загружаем дела…" />}
      {cases?.length === 0 && (
        <p>
          {!platform().capabilities.offline
            ? online
              ? signedIn
                ? "Пока для вас нет доступных дел. Обратитесь к преподавателю."
                : "Без входа доступных дел нет. Войдите в учётную запись — откроются дела вашей группы."
              : "Нет ни одного корректного сценария. Проверьте src/content/cases."
            : embeddedCases()
              ? "В этом файле нет ни одного корректного дела. Соберите файл заново командой pnpm export:offline."
              : "Это шаблон офлайн-версии, в нём нет дел. Готовый файл с делами собирается командой pnpm export:offline — откройте его."}
        </p>
      )}
      <ul className="case-files">
        {cases?.map((c) => {
          const save = saves.get(c.id);
          const outdated = save && save.caseUpdatedAt !== c.updatedAt;
          // пока дело ведётся, прошлый результат не показываем: на карточке только штамп «Ведётся»
          const last = save ? undefined : lastResultOf(results, c.id);
          return (
            <li key={c.id} className={`case-files__item has-stamps-${(save ? 1 : 0) + (last ? 1 : 0)}`}>
              <button className="case-file" onClick={() => openCase(c.id)}>
                <span className="case-file__tab">№{c.number}</span>
                <span className="case-file__body">
                  <span className="case-file__title">{c.title}</span>
                  <span className="case-file__tagline">{c.tagline}</span>
                  {creditText(c.meta) && <span className="case-file__meta">{creditText(c.meta)}</span>}
                  <span className="case-file__meta">
                    Сложность: {DIFFICULTY[c.difficulty]}
                    {c.timeBonus && ` · бонус за ${c.timeBonus.minutes} мин`}
                    {c.isDraft && <span className="review review--draft"> · черновик конструктора</span>}
                  </span>
                </span>
              </button>
              {(save || last) && (
                <span className="case-stamps">
                  {save && (
                    <button
                      className={`case-stamp case-stamp--progress ${outdated ? "is-outdated" : ""}`}
                      onClick={() => void resumeCase(c.id)}
                      title={outdated ? "Дело изменилось — откроется экран дела, расследование придётся начать заново" : "Продолжить расследование"}
                    >
                      <span className="case-stamp__label">{outdated ? "Дело обновлено" : "Ведётся"}</span>
                      {!outdated && <span className="case-stamp__total">{progressPercent(save, c.evidenceCount, c.deductionCount)}%</span>}
                    </button>
                  )}
                  {last && (
                    <button
                      className="case-stamp"
                      data-tone={scoreTone(last.total, last.max, last.score?.timeBonus?.max)}
                      onClick={() => openResult(c.id, last)}
                      title="Открыть результат последнего прохождения"
                    >
                      <span className="case-stamp__label">Результат</span>
                      <span>
                        <span className="case-stamp__total">{last.total}</span>
                        <span className="case-stamp__max">/{last.max}</span>
                      </span>
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** bare — без заголовка (в окне заголовок свой). */
export function HowToContent({ bare }: { bare?: boolean } = {}) {
  return (
    <div className={`howto ${bare ? "howto--bare" : ""}`}>
      {!bare && <h1>Как играть</h1>}
      <ol>
        <li>
          <strong>Осматривайтесь.</strong> <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> или стрелки — движение, <kbd>E</kbd> <kbd>Enter</kbd> <kbd>Пробел</kbd> — осмотреть, заговорить, пройти в
          дверь. На телефоне — джойстик и кнопка действия.
        </li>
        <li>
          <strong>Собирайте материалы.</strong> Всё осмотренное и услышанное само попадает в «Материалы» (<kbd>M</kbd>). Отмечайте важное и неважное, фильтруйте по виду, достоверности и людям.
        </li>
        <li>
          <strong>Расспрашивайте.</strong> Заданные вопросы отмечаются ✓. Новые вопросы появляются, когда у вас есть нужные улики. Кто-то лжёт — ищите противоречия. Приведите одного человека к другому
          — получится очная ставка.
        </li>
        <li>
          <strong>Сопоставляйте</strong> в «Материалах» (кнопка «Сопоставить»): выберите два материала, которые вместе что-то доказывают, — получите вывод. Вывод можно сопоставлять дальше.
        </li>
        <li>
          <strong>Вынесите решение</strong> (<kbd>V</kbd>): какое право затронуто, было ли нарушение, кто отвечает и чем это подтверждается.
        </li>
      </ol>
      <p>
        Заметки — <kbd>N</kbd>; выделите текст и нажмите «В заметки». Правая кнопка мыши — быстрые команды. Подсказки (<kbd>H</kbd>) помогают, но снижают балл; уложитесь в срок и пройдите успешно —
        получите бонус. <kbd>Esc</kbd> закрывает любое окно, <kbd>I</kbd> — эта памятка.
      </p>
    </div>
  );
}

/** «Как играть» окном-папкой: одна вкладка и крестик справа; Esc и клик мимо закрывают. */
export function HowToWindow({ onClose }: { onClose: () => void }) {
  return (
    <TabbedModal tabs={[{ id: "howto", label: "Как играть" }]} onClose={onClose}>
      <HowToContent bare />
    </TabbedModal>
  );
}

export function Intro() {
  const caseFile = useGame((s) => s.caseFile)!;
  const [loaded] = usePlatformValue(() => platform().saves.read(caseFile.id), null as SaveData | null, [caseFile.id]);
  const [cleared, setCleared] = useState(false);
  const save = cleared ? null : loaded;
  const [confirmReset, setConfirmReset] = useState(false);
  const outdated = save && isSaveOutdated(save, caseFile);
  const reset = () => {
    void platform().saves.clear(caseFile.id);
    setCleared(true);
    setConfirmReset(false);
  };

  let footer: ReactNode;
  if (outdated) {
    footer = (
      <button className="btn btn--primary btn--big" onClick={reset}>
        Сбросить и начать заново
      </button>
    );
  } else if (save && confirmReset) {
    footer = (
      <>
        <span>Начать заново? Найденные улики и заметки пропадут.</span>
        <button className="btn btn--danger" onClick={reset}>
          Да, сбросить
        </button>
        <button className="btn" onClick={() => setConfirmReset(false)}>
          Отмена
        </button>
      </>
    );
  } else if (save) {
    footer = (
      <>
        <button className="btn btn--primary btn--big" onClick={() => void actions.resume()}>
          Продолжить расследование
        </button>
        <button className="btn" onClick={() => setConfirmReset(true)}>
          Начать заново
        </button>
      </>
    );
  } else {
    footer = (
      <button className="btn btn--primary btn--big" onClick={actions.beginInvestigation}>
        Приступить к расследованию
      </button>
    );
  }

  return (
    <Folder tab={`ДЕЛО №${caseFile.number}`} onClose={actions.leaveToSite} wide stamp="Учебное" actions={footer}>
      <h1 className="intro__title">{caseFile.title}</h1>
      {caseFile.introduction.split("\n\n").map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {caseFile.timeBonus && !save && (
        <p className="intro__bonus">
          ⏱ Уложитесь в {caseFile.timeBonus.minutes} мин
          {(caseFile.timeBonus.minScore ?? DEFAULT_BONUS_SCORE) > 0 && ` и наберите не меньше ${caseFile.timeBonus.minScore} баллов`} — получите ещё +{caseFile.timeBonus.points}. Время пойдёт с
          началом расследования.
        </p>
      )}
      {outdated && save && (
        <Alert tone="warn">
          ⚠ Дело изменилось:{" "}
          {save.caseUpdatedAt
            ? `вы играли в версию от ${formatSaveDate(save.caseUpdatedAt)}, а сейчас версия от ${formatSaveDate(caseFile.updatedAt)}.`
            : `ваше сохранение сделано на более ранней версии, текущая — от ${formatSaveDate(caseFile.updatedAt)}.`}{" "}
          Улики, диалоги или карта могли поменяться, поэтому продолжить старое расследование нельзя: прогресс ({progressPercent(save, caseFile.evidence.length, caseFile.deductions.length)}%) будет
          сброшен.
        </Alert>
      )}
      {save && !outdated && <p className="resume__status">● Расследование уже идёт: пройдено около {progressPercent(save, caseFile.evidence.length, caseFile.deductions.length)}%</p>}
    </Folder>
  );
}
