import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CaseFile, Dialogue, DialogueNode } from "../../../../shared/case";
import { ENUM_LABELS } from "./labels";
import { effectLabel } from "./fields/effect-label";
import { MOOD_TONE } from "../ui/lib/tone";
import { NODE_W, type Pos } from "./dialogue-layout";

const MOOD_LEGEND: DialogueNode["mood"][] = ["neutral", "friendly", "nervous", "angry", "sad"];

export function Graph({
  dialogue,
  draft,
  positions,
  hasSavedLayout,
  selected,
  onSelect,
  onMove,
  onConnect,
  onAddNode,
  onAddChoice,
  onAutoLayout,
  phone,
}: {
  dialogue: Dialogue;
  draft: CaseFile;
  positions: Record<string, Pos>;
  hasSavedLayout: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, p: Pos) => void;
  onConnect: (nodeId: string, choiceId: string, target: string | null) => void;
  onAddNode: (p: Pos) => void;
  onAddChoice: (nodeId: string) => void;
  onAutoLayout: (heights: Record<string, number>) => void;
  /** Кнопки переходов между списком, графом и репликой — только на телефоне (в панели графа). */
  phone?: ReactNode;
}) {
  const area = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const [, force] = useState(0);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [wire, setWire] = useState<{ nodeId: string; choiceId: string; from: Pos; to: Pos } | null>(null);

  // после отрисовки знаем реальные размеры карточек — перерисуем связи
  useEffect(() => {
    force((v) => v + 1);
  }, [dialogue, positions]);

  // с клавиатуры: Enter/Пробел — выбрать, → по первой связи вперёд, ← к узлу, который сюда ведёт, ↑/↓ — к соседним в списке
  const nodeKeys = (e: React.KeyboardEvent, id: string) => {
    if (e.target !== e.currentTarget) return;
    const focusNode = (target?: string | null) => {
      if (!target) return;
      e.preventDefault();
      cards.current.get(target)?.focus();
      onSelect(target);
    };
    const ids = dialogue.nodes.map((n) => n.id);
    const node = dialogue.nodes.find((n) => n.id === id);
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    } else if (e.key === "ArrowRight") focusNode(node?.choices.find((c) => c.next)?.next);
    else if (e.key === "ArrowLeft") focusNode(dialogue.nodes.find((n) => n.choices.some((c) => c.next === id))?.id);
    else if (e.key === "ArrowDown") focusNode(ids[ids.indexOf(id) + 1]);
    else if (e.key === "ArrowUp") focusNode(ids[ids.indexOf(id) - 1]);
  };
  const measured = () => Object.fromEntries([...cards.current].map(([id, el]) => [id, el.offsetHeight]));
  // первый показ диалога без сохранённой раскладки — раскладываем по настоящим высотам карточек
  useEffect(() => {
    if (!hasSavedLayout) onAutoLayout(measured());
  }, [dialogue.id]); // eslint-disable-line react-hooks/exhaustive-deps -- раскладываем один раз на диалог; onAutoLayout и высоты карточек читаем по месту

  const local = (e: { clientX: number; clientY: number }): Pos => {
    const r = area.current!.getBoundingClientRect();
    return { x: e.clientX - r.left + area.current!.scrollLeft, y: e.clientY - r.top + area.current!.scrollTop };
  };

  const portPos = (nodeId: string, choiceIndex: number): Pos | null => {
    const el = cards.current.get(nodeId)?.querySelectorAll<HTMLElement>(".dg-choice")[choiceIndex];
    const p = positions[nodeId];
    if (!el || !p) return null;
    return { x: p.x + NODE_W, y: p.y + el.offsetTop + el.offsetHeight / 2 };
  };

  const width = Math.max(1200, ...Object.values(positions).map((p) => p.x + NODE_W + 200));
  const height = Math.max(700, ...Object.values(positions).map((p) => p.y + 400));
  const speakerName = (id?: string) => draft.characters.find((c) => c.id === (id ?? dialogue.characterId))?.name ?? id;

  return (
    <div className="dg__graph-wrap">
      <div className="dg__graph-bar">
        {phone}
        <button className="btn btn--sm" onClick={() => onAutoLayout(measured())} title="Расставить реплики автоматически">
          Распределить
        </button>
        <button className="btn btn--sm" onClick={() => onAddNode({ x: (area.current?.scrollLeft ?? 0) + 40, y: (area.current?.scrollTop ?? 0) + 40 })}>
          + реплика
        </button>
        <div className="dg__legend" aria-label="Обозначения">
          {MOOD_LEGEND.map((m) => (
            <span key={m} className="dg__legend-mood" data-tone={MOOD_TONE[m]}>
              <i className="dg-node__head" /> {ENUM_LABELS[m]}
            </span>
          ))}
          <span className="dg-tag dg-tag--cond">условие</span>
          <span className="dg-tag dg-tag--end">конец</span>
        </div>
      </div>
      <div
        ref={area}
        className="dg__graph"
        role="presentation"
        onDoubleClick={(e) => e.target === e.currentTarget.firstChild && onAddNode(local(e))}
        onMouseMove={(e) => {
          if (drag) {
            const p = local(e);
            onMove(drag.id, { x: Math.max(0, p.x - drag.dx), y: Math.max(0, p.y - drag.dy) });
          }
          if (wire) setWire({ ...wire, to: local(e) });
        }}
        onMouseUp={(e) => {
          setDrag(null);
          if (wire) {
            const target = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node;
            // отпустили на пустом месте — вариант завершает разговор
            onConnect(wire.nodeId, wire.choiceId, target ?? null);
            setWire(null);
          }
        }}
        onMouseLeave={() => {
          setDrag(null);
          setWire(null);
        }}
      >
        <div className="dg__canvas" role="presentation" style={{ width, height }} onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
          <svg className="dg__wires" width={width} height={height}>
            {dialogue.nodes.flatMap((n) =>
              n.choices.map((c, i) => {
                const from = portPos(n.id, i);
                if (!from) return null;
                if (c.next === null) return null;
                const to = positions[c.next];
                if (!to) return null;
                // возврат назад (обычно «Понятно» → к списку вопросов) — короткая метка вместо кривой через весь граф
                if (to.x < from.x - NODE_W / 2) {
                  return (
                    <text key={`${n.id}/${c.id}`} x={from.x + 10} y={from.y + 4} className="dg__back">
                      ↩ {c.next}
                    </text>
                  );
                }
                const tx = to.x;
                const ty = to.y + 18;
                const mx = Math.max(60, Math.abs(tx - from.x) / 2);
                return (
                  <path
                    key={`${n.id}/${c.id}`}
                    d={`M ${from.x} ${from.y} C ${from.x + mx} ${from.y}, ${tx - mx} ${ty}, ${tx} ${ty}`}
                    className={`dg__wire ${c.requires ? "is-conditional" : ""} ${selected === n.id ? "is-hot" : ""}`}
                  />
                );
              }),
            )}
            {wire && <path d={`M ${wire.from.x} ${wire.from.y} L ${wire.to.x} ${wire.to.y}`} className="dg__wire is-drawing" />}
          </svg>
          {dialogue.nodes.map((n) => {
            const p = positions[n.id];
            if (!p) return null;
            const multi = n.speaker && n.speaker !== dialogue.characterId;
            return (
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- карточка узла — элемент составного виджета: фокус и ←→↑↓ (nodeKeys)
              <div
                key={n.id}
                data-node={n.id}
                ref={(el) => {
                  if (el) cards.current.set(n.id, el);
                  else cards.current.delete(n.id);
                }}
                data-tone={MOOD_TONE[n.mood]}
                data-selected={selected === n.id || undefined}
                className={`dg-node ${n.id === dialogue.startNodeId ? "is-start" : ""}`}
                style={{ left: p.x, top: p.y, width: NODE_W }}
                role="group"
                aria-label={`Реплика ${n.id}: ${n.text.slice(0, 80)}`}
                aria-current={selected === n.id ? "true" : undefined}
                tabIndex={0}
                onClick={() => onSelect(n.id)}
                onKeyDown={(e) => nodeKeys(e, n.id)}
              >
                <div
                  role="presentation"
                  className="dg-node__head"
                  onMouseDown={(e) => {
                    const l = local(e);
                    setDrag({ id: n.id, dx: l.x - p.x, dy: l.y - p.y });
                    onSelect(n.id);
                  }}
                >
                  {n.id === dialogue.startNodeId && <span className="dg-tag dg-tag--start">★ начало</span>}
                  {n.auto && (
                    <span className="dg-tag" title="Игрок этот узел не видит: первый вариант с выполненным условием срабатывает сам">
                      переход
                    </span>
                  )}
                  <b>{n.id}</b>
                  <span className={`dg-node__speaker ${multi ? "is-other" : ""}`}>{speakerName(n.speaker)}</span>
                </div>
                <div className="dg-node__text">{n.text}</div>
                {n.textVariants && n.textVariants.length > 0 && (
                  <div className="dg-node__effects" title="Текст реплики меняется по условию">
                    ✎ вариантов текста: {n.textVariants.length}
                  </div>
                )}
                {n.effects.length > 0 && (
                  <div className="dg-node__effects" title="Что произойдёт, когда прозвучит реплика">
                    ⚡ {n.effects.map(effectLabel).join("; ")}
                  </div>
                )}
                <ul className="dg-node__choices">
                  {n.choices.map((c, i) => (
                    <li key={c.id} className="dg-choice">
                      <span className="dg-choice__text">{c.text}</span>
                      {(c.requires || c.next === null || c.effects?.length > 0) && (
                        <span className="dg-choice__tags">
                          {c.requires && (
                            <span className="dg-tag dg-tag--cond" title="Вариант виден только при выполнении условия">
                              условие
                            </span>
                          )}
                          {c.effects?.length > 0 && (
                            <span className="dg-tag" title={`При выборе: ${c.effects.map(effectLabel).join("; ")}`}>
                              ⚡
                            </span>
                          )}
                          {c.next === null && (
                            <span className="dg-tag dg-tag--end" title="Выбор этого варианта завершает разговор">
                              конец
                            </span>
                          )}
                        </span>
                      )}
                      <span
                        role="presentation"
                        className="dg-choice__port"
                        title="Тяните, чтобы связать с узлом"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const from = portPos(n.id, i);
                          if (from) setWire({ nodeId: n.id, choiceId: c.id, from, to: from });
                        }}
                      />
                    </li>
                  ))}
                </ul>
                <button
                  className="dg-node__add"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChoice(n.id);
                  }}
                >
                  + вариант
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
