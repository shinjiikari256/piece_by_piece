import { useMemo, useRef, useState } from "react";
import { useWindowKey } from "../hooks";
import { sourceOf } from "../../content/case-utils";
import { resolveLook } from "../../game/art";
import { actions, useGame, type Mark } from "../../state/store";
import type { Evidence } from "../../../../../shared/case";
import type { PublicDeduction as Deduction } from "../../../../../shared/public-case";
import { EvidenceCard, FactCard, INTERACTIVE, KIND_ICON, KIND_LABEL, LEVEL, MarkButtons, Reliability, kindTitle, type MaterialKind } from "../common";
import { Icon } from "../icons";
import { Md } from "../md";
import { Portrait } from "../panels";
import { MatchPanel } from "./match";
import { Select } from "../Select";
import { useCase } from "./index";

// ---------- Материалы ----------

type Item =
  | { key: string; kind: MaterialKind; evidence: Evidence; deduction?: undefined }
  | { key: string; kind: "fact"; deduction: Deduction; evidence?: undefined };

const MARK_ORDER: Record<"important" | "none" | "unimportant", number> = { important: 0, none: 1, unimportant: 2 };

export function MaterialsTab({ match, focus }: { match: boolean; focus?: string }) {
  const caseFile = useCase();
  const collected = useGame((s) => s.progress.collected);
  const solved = useGame((s) => s.progress.deductions);
  const marks = useGame((s) => s.marks);
  const [kind, setKind] = useState<MaterialKind | "all">("all");
  const [reliability, setReliability] = useState<Evidence["reliability"] | "all">("all");
  const [person, setPerson] = useState<string | "all">("all");
  const [selected, setSelected] = useState<string | null>(focus ?? null);
  const [picked, setPicked] = useState<string[]>([]);

  const items: Item[] = useMemo(() => {
    const facts: Item[] = solved.map((id) => ({ key: `fact:${id}`, kind: "fact", deduction: caseFile.deductions.find((d) => d.id === id)! }));
    const evidence: Item[] = collected.map((id) => {
      const e = caseFile.evidence.find((x) => x.id === id)!;
      return { key: id, kind: e.kind, evidence: e };
    });
    return [...facts, ...evidence];
  }, [caseFile, collected, solved]);

  const peopleOf = (it: Item) => {
    if (it.evidence) {
      const src = sourceOf(caseFile, it.evidence.id);
      return new Set([...it.evidence.relatedCharacters, ...(src?.characterId ? [src.characterId] : [])]);
    }
    return new Set(it.deduction!.evidenceIds.flatMap((id) => caseFile.evidence.find((e) => e.id === id)?.relatedCharacters ?? []));
  };

  const shown = items
    .filter((it) => kind === "all" || it.kind === kind)
    .filter((it) => !(match && it.kind === "item")) // предметы в сопоставления не берут
    .filter((it) => reliability === "all" || it.evidence?.reliability === reliability)
    .filter((it) => person === "all" || peopleOf(it).has(person))
    .sort((a, b) => MARK_ORDER[marks[a.key] ?? "none"] - MARK_ORDER[marks[b.key] ?? "none"]);

  const people = caseFile.characters.filter((c) => items.some((it) => peopleOf(it).has(c.id)));
  const current = items.find((it) => it.key === selected) ?? null;

  // сопоставляем пары; третий выбор заменяет второй
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : [p[0], id]));

  const toggleMatch = () => {
    // уже открытый материал — первым на доску
    setPicked(!match && selected ? [selected] : []);
    actions.open({ kind: "journal", tab: "materials", match: !match });
  };
  // «Сопоставить» / «Изучить» — клавиша C (вкладка «Материалы» открыта, раз смонтирован этот компонент); по физической клавише, как остальные
  useWindowKey((e) => {
    if (e.code !== "KeyC" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !items.length) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, [aria-haspopup], [role="listbox"]')) return;
    e.preventDefault();
    toggleMatch();
  });

  // В режиме сопоставления карточку выбирает только пробел, а Enter — само сопоставление (главная кнопка доски: «Сопоставить», «Очистить», «Новое сопоставление»)
  const root = useRef<HTMLDivElement>(null);
  useWindowKey((e) => {
    if (!match || e.key !== "Enter" || e.repeat) return;
    if (e.target instanceof Element && e.target.closest(INTERACTIVE) && !e.target.closest(".materials__list")) return; // остальные кнопки нажимаются сами
    e.preventDefault();
    e.stopImmediatePropagation(); // иначе Enter нажмёт «Изучить» — основную кнопку окна
    root.current?.querySelector<HTMLButtonElement>(".board__result .btn:not(:disabled)")?.click();
  });

  if (!items.length) {
    return <p className="empty">Пока пусто. Осматривайте предметы и расспрашивайте людей — найденное попадёт сюда.</p>;
  }

  return (
    <div className="materials" ref={root}>
      <div className="materials__bar">
        <Select
          variant="filter"
          label="Вид"
          highlight={kind !== "all"}
          value={kind}
          onChange={(v) => setKind(v as MaterialKind | "all")}
          options={[
            { value: "all", label: "все" },
            ...(["evidence", "testimony", "item", "fact"] as const).map((k) => ({ value: k, label: KIND_LABEL[k], art: <Icon name={KIND_ICON[k]} size={14} /> })),
          ]}
        />
        <Select
          variant="filter"
          label="Достоверность"
          highlight={reliability !== "all"}
          value={reliability}
          onChange={(v) => setReliability(v as Evidence["reliability"] | "all")}
          options={[
            { value: "all", label: "любая" },
            ...(["high", "medium", "low"] as const).map((r) => ({ value: r, label: LEVEL[r] })),
          ]}
        />
        <Select
          variant="filter"
          label="Человек"
          highlight={person !== "all"}
          value={person}
          onChange={setPerson}
          options={[
            { value: "all", label: "все" },
            ...people.map((c) => ({ value: c.id, label: c.name, art: <Portrait look={resolveLook(c)} /> })),
          ]}
        />
        {(kind !== "all" || reliability !== "all" || person !== "all") && (
          <button
            className="link-btn materials__reset"
            onClick={() => {
              setKind("all");
              setReliability("all");
              setPerson("all");
            }}
          >
            сбросить
          </button>
        )}
        <span className="materials__count" title="Найдено материалов и установлено выводов из всех в деле">
          <Icon name="evidence" size={15} /> {collected.length}/{caseFile.evidence.length}
          <Icon name="fact" size={15} /> {solved.length}/{caseFile.deductions.length}
        </span>
        <button
          className={`btn materials__match ${match ? "btn--primary" : ""}`}
          onClick={toggleMatch}
        >
          <Icon name={match ? "evidence" : "link"} size={16} /> {match ? "Изучить" : "Сопоставить"} <kbd>C</kbd>
        </button>
      </div>

      <div className="materials__body">
        <div className="materials__list">
          <div className="card-grid">
            {shown.map((it) =>
              it.deduction ? (
                <FactCard
                  key={it.key}
                  deduction={it.deduction}
                  mark={marks[it.key] as Mark | undefined}
                  selected={match ? picked.includes(it.key) : selected === it.key}
                  onClick={() => (match ? togglePick(it.key) : setSelected(it.key))}
                />
              ) : (
                <EvidenceCard
                  key={it.key}
                  evidence={it.evidence!}
                  mark={marks[it.key] as Mark | undefined}
                  selected={match ? picked.includes(it.key) : selected === it.key}
                  onClick={() => (match ? togglePick(it.key) : setSelected(it.key))}
                />
              ),
            )}
          </div>
          {!shown.length && <p className="muted">Под фильтры ничего не подходит.</p>}
        </div>
        <aside className="materials__detail">
          {match ? (
            <MatchPanel picked={picked} onRemove={togglePick} onClear={() => setPicked([])} />
          ) : current ? (
            current.deduction ? (
              <FactDetail deduction={current.deduction} mark={marks[current.key] as Mark | undefined} onOpen={setSelected} />
            ) : (
              <EvidenceDetail evidence={current.evidence!} mark={marks[current.key] as Mark | undefined} />
            )
          ) : (
            <p className="materials__placeholder">Выберите материал слева, чтобы прочитать его целиком.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

export function EvidenceDetail({ evidence: e, mark, hideMarks }: { evidence: Evidence; mark?: Mark; hideMarks?: boolean }) {
  const caseFile = useCase();
  const src = sourceOf(caseFile, e.id);
  const srcChar = src?.characterId ? caseFile.characters.find((c) => c.id === src.characterId) : undefined;
  const events = e.relatedEvents.map((id) => caseFile.events.find((x) => x.id === id)!).filter(Boolean);
  const people = e.relatedCharacters.map((id) => caseFile.characters.find((c) => c.id === id)!).filter(Boolean);
  return (
    <article className="detail" data-tone={e.kind} data-mark-key={e.id} data-title={e.title}>
      <header className="detail__head">
        <span className="detail__icon">
          <Icon name={KIND_ICON[e.kind]} size={26} />
        </span>
        <div>
          <span className="detail__type">{kindTitle(e)}</span>
          <h3>{e.title}</h3>
        </div>
      </header>
      <div className="detail__meta">
        <Reliability level={e.reliability} />
        {!hideMarks && <MarkButtons markKey={e.id} mark={mark} />}
      </div>
      {src && (
        <p className="detail__source">
          <span className="detail__label">Источник:</span>
          {srcChar && <Portrait look={resolveLook(srcChar)} />}
          <b>{src.text}</b>
        </p>
      )}
      {events.length > 0 && (
        <div className="detail__events">
          {events.map((ev) => (
            <span key={ev.id} className="event-chip">
              <span className="event-chip__time">{ev.time}</span>
              {ev.title}
            </span>
          ))}
        </div>
      )}
      {e.attachments && e.attachments.length > 0 && (
        <div className="detail__attachments">
          {e.attachments.map((m, i) =>
            m.kind === "link" ? (
              /^https?:\/\//i.test(m.src) && (
                <a key={i} className="attachment-link" href={m.src} target="_blank" rel="noreferrer noopener">
                  {m.caption || m.src}
                </a>
              )
            ) : (
              <figure key={i} className="attachment">
                {m.kind === "image" || m.kind === "scan" ? (
                  <img src={m.src} alt={m.caption} loading="lazy" />
                ) : m.kind === "video" ? (
                  <video src={m.src} controls preload="metadata" />
                ) : (
                  <audio src={m.src} controls preload="metadata" />
                )}
                {m.caption && <figcaption>{m.caption}</figcaption>}
              </figure>
            ),
          )}
        </div>
      )}
      <div className="document">
        <Md text={e.details} />
      </div>
      {people.length > 0 && (
        <div className="detail__people row row--wrap">
          <span className="detail__label">Связанные люди:</span>
          {people.map((c) => (
            <button
              key={c.id}
              className="person-chip"
              title={`${c.position} — открыть карточку`}
              onClick={() => actions.open({ kind: "journal", tab: "characters", focus: c.id })}
            >
              <Portrait look={resolveLook(c)} />
              {c.name}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function FactDetail({ deduction: d, mark, onOpen }: { deduction: Deduction; mark?: Mark; onOpen: (key: string) => void }) {
  const caseFile = useCase();
  const conclusion = useGame((s) => s.conclusions[d.id]);
  return (
    <article className="detail" data-tone="conclusion">
      <header className="detail__head">
        <span className="detail__icon">
          <Icon name="fact" size={26} />
        </span>
        <div>
          <span className="detail__type">Установленный вывод</span>
          <h3>{d.title}</h3>
        </div>
      </header>
      <div className="detail__meta">
        <MarkButtons markKey={`fact:${d.id}`} mark={mark} />
      </div>
      <p className="fact__conclusion">{conclusion}</p>
      <span className="detail__label">Основано на:</span>
      <div className="fact__sources">
        {d.evidenceIds.map((eid) => {
          const e = caseFile.evidence.find((x) => x.id === eid)!;
          return <EvidenceCard key={eid} evidence={e} compact onClick={() => onOpen(eid)} />;
        })}
      </div>
    </article>
  );
}
