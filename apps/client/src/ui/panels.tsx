import { meets, nodeText } from "../../../../shared/conditions";
import { useEffect, useRef, useState } from "react";
import { useWindowKey } from "./hooks";
import { MOOD_TONE } from "./tone";
import { Backdrop } from "./window";
import { CHAR_H, CHAR_W, drawCharacter, resolveLook, type CharFrame, type Look } from "../game/art";
import { actions, useGame } from "../state/store";
import { findObject } from "../content/case-utils";
import { objectEvidenceIds } from "../../../../shared/case";
import { currentInteraction } from "../../../../shared/object-state";
import { KIND_ICON, KIND_LABEL, TabbedModal } from "./common";
import { FolderTabs } from "./folder";
import { EvidenceDetail } from "./journal/materials";
import { Icon } from "./icons";
import { Md } from "./md";

const useCase = () => useGame((s) => s.caseFile)!;

// ---------- Портрет ----------

/** look — готовый облик или своя внешность персонажа (см. resolveLook). */
export function Portrait({ look, talking }: { look: Look; talking?: boolean }) {
  const key = JSON.stringify(look);
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!talking) return;
    const t = setInterval(() => setTick((v) => v + 1), 180);
    return () => clearInterval(t);
  }, [talking]);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CHAR_W, CHAR_H);
    const frame: CharFrame = talking && tick % 2 === 0 ? "talk" : "idle";
    drawCharacter(ctx, look, frame, 0);
  }, [key, talking, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={CHAR_W} height={CHAR_H} className="portrait" aria-hidden />;
}

// ---------- Осмотр объекта ----------

export function ObjectPanel({ objectId, gained = [] }: { objectId: string; gained?: string[] }) {
  const caseFile = useCase();
  const marks = useGame((s) => s.marks);
  const collected = useGame((s) => s.progress.collected);
  const progress = useGame((s) => s.progress);
  const locationId = useGame((s) => s.locationId);
  const [tab, setTab] = useState("inspect");
  const [seen, setSeen] = useState<string[]>([]); // закладки «новое», которые игрок уже открыл
  const obj = findObject(caseFile, objectId);
  const it = obj ? currentInteraction(obj, progress, locationId) : null;
  if (!obj || !it) return null;
  // улики, которые этот предмет выдаёт и которые уже в деле (условия выдачи сработали при осмотре)
  const items = objectEvidenceIds(obj)
    .filter((id) => collected.includes(id))
    .map((id) => caseFile.evidence.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e);
  const present = items.find((e) => e.id === tab);
  const markButtons = (e: (typeof items)[number], closes: boolean) => (
    <>
      <button
        className={`btn ${closes ? "mark-close mark-close--important" : ""}`}
        aria-pressed={marks[e.id] === "important"}
        onClick={() => {
          actions.setMark(e.id, "important");
          if (closes) actions.close();
        }}
        title={closes ? "Пометить важным и закрыть" : "Пометить важным"}
      >
        <Icon name="star" size={15} /> Важно
      </button>
      <button
        className={`btn ${closes ? "mark-close" : ""}`}
        aria-pressed={marks[e.id] === "unimportant"}
        onClick={() => {
          actions.setMark(e.id, "unimportant");
          if (closes) actions.close();
        }}
        title={closes ? "Пометить неважным и закрыть" : "Пометить неважным"}
      >
        <Icon name="dim" size={15} /> Неважно
      </button>
    </>
  );
  const closeButton = (
    <button className="btn btn--primary" onClick={actions.close}>
      Закрыть
    </button>
  );

  // несколько улик: закладки — «Осмотр» и по закладке на каждую улику; свежевыданные помечены точкой, пока закладка не открыта
  if (items.length > 1) {
    const tabs = [
      { id: "inspect", label: "Осмотр", icon: "search" as const },
      ...items.map((e) => ({ id: e.id, label: e.title, icon: KIND_ICON[e.kind], isNew: gained.includes(e.id) && !seen.includes(e.id) })),
    ];
    return (
      <TabbedModal
        tabs={tabs}
        active={tab}
        onTab={(id) => {
          setTab(id);
          setSeen((s) => (s.includes(id) ? s : [...s, id]));
        }}
        size="narrow"
        className="inspect"
      >
        {present ? (
          <>
            <EvidenceDetail evidence={present} mark={marks[present.id]} hideMarks />
            <div className="modal__actions inspect__actions">
              {markButtons(present, false)}
              {closeButton}
            </div>
          </>
        ) : (
          <>
            <h2 className="modal__title">{it.title}</h2>
            {it.description && <Md className="lead" text={it.description} />}
            <p className="muted inspect__note">
              <Icon name="check" size={14} /> Добавлено в материалы дела: {items.map((e) => e.title).join(", ")}
            </p>
            <div className="modal__actions inspect__actions">{closeButton}</div>
          </>
        )}
      </TabbedModal>
    );
  }

  // одна улика или ни одной: окно одной страницей, «Важно / Неважно» закрывают окно
  const single = items[0];
  return (
    <TabbedModal tabs={[{ id: "inspect", label: "Осмотр", icon: "search" }]} size="narrow" className="inspect">
      <h2 className="modal__title">{it.title}</h2>
      {it.description && <Md className="lead" text={it.description} />}
      {single && <EvidenceDetail evidence={single} mark={marks[single.id]} hideMarks />}
      <div className="modal__actions inspect__actions">
        {single && (
          <>
            <span className="muted inspect__note">
              <Icon name="check" size={14} /> Добавлено в материалы дела
            </span>
            {markButtons(single, true)}
          </>
        )}
        {closeButton}
      </div>
    </TabbedModal>
  );
}

// ---------- Диалог ----------

const MOOD = { neutral: "", friendly: "дружелюбно", nervous: "нервничает", angry: "раздражён(а)", sad: "расстроен(а)" };

interface ChoiceView {
  id: string;
  text: string;
  asked: boolean;
  evidence: boolean;
  onPick: () => void;
}

export function DialogueWindow({
  npcId,
  dialogueId,
  nodeId,
}: {
  npcId: string;
  dialogueId: string;
  nodeId: string;
}) {
  const caseFile = useCase();
  // подписка, чтобы список вариантов пересчитывался при изменении прогресса
  const progress = useGame((s) => s.progress);
  const locationId = useGame((s) => s.locationId);
  const dialogue = caseFile.dialogues.find((d) => d.id === dialogueId)!;
  const node = dialogue.nodes.find((n) => n.id === nodeId)!;
  const speakerOf = (id?: string) => caseFile.characters.find((c) => c.id === (id ?? dialogue.characterId))!;
  const character = speakerOf(node.speaker);
  const mood = node.mood;
  const text = nodeText(node, progress, locationId);
  // в разговоре нескольких персонажей видно, что сказали перед этим
  const multi = dialogue.nodes.some((n) => n.speaker && n.speaker !== dialogue.characterId);
  const [history, setHistory] = useState<{ key: string; speaker: string; text: string }[]>([]);
  const shown = useRef(`${dialogueId}/${nodeId}`);
  useEffect(() => {
    const key = `${dialogueId}/${nodeId}`;
    if (shown.current === key) return;
    const [prevDialogue, prevNode] = shown.current.split("/");
    shown.current = key;
    if (!multi || prevDialogue !== dialogueId) return setHistory([]);
    const prev = dialogue.nodes.find((n) => n.id === prevNode);
    if (prev) setHistory((h) => [...h, { key: `${h.length}`, speaker: speakerOf(prev.speaker).name, text: nodeText(prev, progress, locationId) }].slice(-3));
  }, [dialogueId, nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Заданные вопросы остаются на своих местах с отметкой — нумерация не прыгает
  const available: ChoiceView[] = node.choices
        .filter((c) => actions.isChoiceVisible(c))
        .map((c) => ({
          id: c.id,
          text: c.text,
          // ✓ у уже заданных вопросов (не у «назад» и «до свидания»)
          asked: c.next !== null && c.next !== dialogue.startNodeId && actions.isChoiceUsed(dialogueId, nodeId, c.id),
          evidence: !!c.requires?.evidence,
          onPick: () => actions.choose(c.id),
        }));
  // подходящих вариантов нет (все скрыты условиями): разговор не должен застревать — всегда есть выход
  const choices: ChoiceView[] = available.length ? available : [{ id: "__end", text: "Закончить разговор", asked: false, evidence: false, onPick: actions.close }];

  const [presenting, setPresenting] = useState(false);
  useEffect(() => setPresenting(false), [dialogueId, nodeId]);
  const canPresent = !!node.presentations?.length && progress.collected.length > 0;

  const list = useRef<HTMLOListElement>(null);
  useWindowKey((e) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>("button.choice") ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const n = Number(e.key);
    if (n >= 1 && n <= buttons.length) {
      // цифра только выделяет вариант, выбор — Enter
      e.preventDefault();
      buttons[n - 1].focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = current === -1 ? (step > 0 ? 0 : buttons.length - 1) : (current + step + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (e.key === "Enter" && current === -1 && !e.repeat && !e.defaultPrevented) {
      // ничего не выделено — первый ещё не заданный вопрос
      e.preventDefault();
      (choices.find((c) => !c.asked) ?? choices[0])?.onPick();
    }
  });

  return (
    <Backdrop align="end" key={npcId}>
      <div className="dialogue-folder">
      <FolderTabs
        tabs={[{ id: "talk", label: "Разговор", icon: "testimony" }]}
        active="talk"
        onClose={actions.close}
        className="folder--tabbed tabbed-modal__tabs"
      />
      <section className="dialogue paper" role="dialog" aria-label={`Разговор: ${character.name}`}>
        <div className="dialogue__speaker">
          <Portrait look={resolveLook(character)} talking />
          <div>
            <div className="dialogue__name">{character.name}</div>
            <div className="dialogue__position">{character.position}</div>
            {MOOD[mood] && <div className="mood" data-tone={MOOD_TONE[mood]}>{MOOD[mood]}</div>}
          </div>
        </div>
        {history.length > 0 && (
          <ol className="transcript">
            {history.map((h) => (
              <li key={h.key}>
                <b>{h.speaker}:</b> {h.text}
              </li>
            ))}
          </ol>
        )}
        <p className="dialogue__text" key={`text:${dialogueId}/${node.id}`}>
          {text}
        </p>
        {presenting ? (
          <ol className="dialogue__choices list-reset" key={`present:${dialogueId}/${nodeId}`}>
            {progress.collected.map((id, i) => {
              const ev = caseFile.evidence.find((e) => e.id === id);
              return ev ? (
                <li key={id}>
                  <button className="choice" data-tone={ev.kind} onClick={() => actions.present(id)}>
                    <span className="choice__num">{i + 1}</span>
                    <span className="choice__tag">
                      <Icon name={KIND_ICON[ev.kind]} size={14} /> {KIND_LABEL[ev.kind]}
                    </span>
                    <span className="choice__text">{ev.title}</span>
                    {actions.isChoiceUsed(dialogueId, nodeId, `present:${id}`) && <span className="choice__asked" aria-label="уже предъявляли">✓</span>}
                  </button>
                </li>
              ) : null;
            })}
            <li>
              <button className="choice" onClick={() => setPresenting(false)}>
                <span className="choice__text">Назад к разговору</span>
              </button>
            </li>
          </ol>
        ) : (
        <ol className="dialogue__choices list-reset" ref={list} key={`choices:${dialogueId}/${nodeId}`}>
          {choices.map((c, i) => (
            <li key={c.id}>
              <button
                className={`choice ${c.asked ? "is-asked" : ""}`}
                onClick={c.onPick}
                title={c.asked ? "Уже спрашивали — собеседнику придётся повторить" : undefined}
              >
                <span className="choice__num">{i + 1}</span>
                {c.evidence && <span className="choice__tag">по улике</span>}
                <span className="choice__text">{c.text}</span>
                {c.asked && <span className="choice__asked" aria-label="уже спрашивали">✓</span>}
              </button>
            </li>
          ))}
          {canPresent && (
            <li>
              <button className="choice" onClick={() => setPresenting(true)}>
                <span className="choice__tag">предъявить</span>
                <span className="choice__text">Предъявить материал из журнала…</span>
              </button>
            </li>
          )}
        </ol>
        )}
      </section>
      </div>
    </Backdrop>
  );
}

// ---------- Подсказки ----------

export function HintsPanel() {
  const caseFile = useCase();
  const used = useGame((s) => s.hintsUsed);
  const opened = useGame((s) => s.hints);
  const hints = [...caseFile.hints].sort((a, b) => a.level - b.level);
  const next = hints[used];
  const progress = useGame((s) => s.progress);
  const locationId = useGame((s) => s.locationId);
  const locked = !!next && !meets(next.requires, progress, locationId);
  return (
    <TabbedModal tabs={[{ id: "hints", label: "Подсказки", icon: "bulb" }]} size="narrow">
      <p className="muted">Подсказки не дают ответа напрямую. Каждая снижает итоговый балл.</p>
      <ol className="hints list-reset">
        {hints.map((h, i) => (
          <li key={h.level} data-open={i < used || undefined}>
            <span className="hints__level">Подсказка {h.level}</span>
            {i < used ? <p>{opened.find((o) => o.level === h.level)?.text}</p> : <p className="muted">Скрыта · −{h.penalty} баллов</p>}
          </li>
        ))}
      </ol>
      <div className="modal__actions">
        {next ? (
          <button className="btn btn--primary" disabled={locked} onClick={() => void actions.revealHint()}>
            {locked ? `Подсказка ${next.level} пока недоступна` : `Открыть подсказку ${next.level} (−${next.penalty})`}
          </button>
        ) : (
          <span className="muted">Все подсказки открыты.</span>
        )}
      </div>
    </TabbedModal>
  );
}
