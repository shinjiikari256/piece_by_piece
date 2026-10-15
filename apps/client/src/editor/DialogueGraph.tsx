import { readJson, writeJson } from "../state/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Dialogue as DialogueSchema, DialogueNode as NodeSchema } from "../../../../shared/case";
import type { CaseFile, Dialogue, DialogueNode } from "../../../../shared/case";
import { editor, useEditor } from "./state";
import { ENUM_LABELS } from "./labels";
import { ObjectFields, type JS } from "./SchemaForm";
import { ArtThumb } from "./Pickers";
import { EntityList, ItemText } from "./EntityList";
import { PanelGrip, PanelRail, panelVars, usePanel } from "./panels";
import { DialogueTrigger } from "./fields/DialogueTrigger";
import { MOOD_TONE } from "../ui/tone";
import { setSearchParams } from "../ui/router";
import { useUrlParam, useWriteDefaultParam } from "./url";
import { resolveLook } from "../game/art";
import { ask } from "../ui/dialog";

const NODE_SCHEMA: JS = z.toJSONSchema(NodeSchema);
const DIALOGUE_SCHEMA: JS = z.toJSONSchema(DialogueSchema);

const NODE_W = 240;
const COL_GAP = 90;
const ROW_GAP = 24;

type Pos = { x: number; y: number };
type Layout = Record<string, Record<string, Pos>>;

const layoutKey = (caseId: string) => `editor:layout:${caseId}`;
const loadLayout = (caseId: string): Layout => readJson<Layout>(layoutKey(caseId), {});
const saveLayout = (caseId: string, layout: Layout) => void writeJson(layoutKey(caseId), layout);

/** Оценка высоты карточки, пока она не отрисована. */
const estimateHeight = (n: DialogueNode) => 92 + n.choices.length * 27 + (n.effects.length ? 20 : 0);

/**
 * Раскладка по слоям: старт слева, дальше — по расстоянию от него.
 * В колонке карточки идут в порядке обхода и ставятся друг под друга по реальной высоте.
 */
function autoLayout(d: Dialogue, heights: Record<string, number> = {}): Record<string, Pos> {
  const depth = new Map<string, number>([[d.startNodeId, 0]]);
  const order = [d.startNodeId];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const node = d.nodes.find((n) => n.id === id);
    for (const ch of node?.choices ?? []) {
      if (ch.next && !depth.has(ch.next)) {
        depth.set(ch.next, depth.get(id)! + 1);
        order.push(ch.next);
      }
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  const byOrder = [...d.nodes].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
  });
  const colY = new Map<number, number>();
  const out: Record<string, Pos> = {};
  for (const n of byOrder) {
    const col = depth.get(n.id) ?? maxDepth + 1; // недостижимые — в отдельной колонке справа
    const y = colY.get(col) ?? 20;
    out[n.id] = { x: 20 + col * (NODE_W + COL_GAP), y };
    colY.set(col, y + (heights[n.id] ?? estimateHeight(n)) + ROW_GAP);
  }
  return out;
}

/**
 * Редактор диалога-графа. Без fixedId — раздел «Диалоги» со списком обычных разговоров;
 * с fixedId — встроенный редактор разговора очной ставки.
 */
export function DialogueEditor({ fixedId }: { fixedId?: string } = {}) {
  const listPanel = usePanel("dialogue-list", "Диалоги", "left", { width: 240, min: 160, max: 420 });
  const sidePanel = usePanel("dialogue-node", "Реплика", "right", { width: 384, min: 280, max: 640 });
  const draft = useEditor((s) => s.draft);
  const confIds = new Set(draft.confrontations.map((c) => c.dialogueId));
  const ownDialogues = draft.dialogues.filter((d) => !confIds.has(d.id));
  // раздел «Диалоги»: выбранный разговор и узел — в адресе (`?item=…&node=…`); встроенный разговор очной ставки адрес не трогает
  const [urlDialogue] = useUrlParam("item", "");
  const [urlNode] = useUrlParam("node", "");
  const pickedId = ownDialogues.some((d) => d.id === urlDialogue) ? urlDialogue : (ownDialogues[0]?.id ?? "");
  const setDialogueId = (id: string) => setSearchParams({ item: id === ownDialogues[0]?.id ? null : id, node: null });
  useWriteDefaultParam("item", !!fixedId || pickedId === urlDialogue, ownDialogues[0]?.id);
  const dialogueId = fixedId ?? pickedId;
  const dlgIndex = draft.dialogues.findIndex((d) => d.id === dialogueId);
  const dialogue = dlgIndex >= 0 ? draft.dialogues[dlgIndex] : fixedId ? undefined : ownDialogues[0];
  const isConfrontation = dialogue ? confIds.has(dialogue.id) : false;
  const [localNode, setLocalNode] = useState<string | null>(null);
  const selected = fixedId ? localNode : urlNode || null;
  const setSelected = (id: string | null) => (fixedId ? setLocalNode(id) : setSearchParams({ node: id }));
  // переход к узлу с ошибкой
  const focus = useEditor((s) => s.focus);
  useEffect(() => {
    if (!focus?.id) return;
    if (!fixedId && focus.section === "dialogues") {
      setDialogueId(focus.id);
      setSelected(focus.sub ?? null);
    }
    if (fixedId && focus.section === "confrontations" && focus.sub) setSelected(focus.sub);
  }, [focus, fixedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [layout, setLayout] = useState<Layout>(() => loadLayout(draft.id));
  useEffect(() => setLayout(loadLayout(draft.id)), [draft.id]);

  const updateDialogue = (fn: (d: Dialogue) => Dialogue, merge?: string) =>
    editor.update((c) => ({ ...c, dialogues: c.dialogues.map((d) => (d.id === dialogue?.id ? fn(d) : d)) }), merge);

  const positions = useMemo(() => {
    if (!dialogue) return {};
    const saved = layout[dialogue.id] ?? {};
    const auto = autoLayout(dialogue);
    return Object.fromEntries(dialogue.nodes.map((n) => [n.id, saved[n.id] ?? auto[n.id]]));
  }, [dialogue, layout]);

  const setPositions = (pos: Record<string, Pos>) => {
    if (!dialogue) return;
    const next = { ...layout, [dialogue.id]: pos };
    setLayout(next);
    saveLayout(draft.id, next);
  };

  if (!dialogue) {
    return (
      <section className="ed__panel">
        <p>{fixedId ? `Диалог «${fixedId}» не найден.` : "Диалогов нет."}</p>
        {!fixedId && (
          <button className="btn btn--sm" onClick={() => addDialogue(draft, setDialogueId)}>
            + диалог
          </button>
        )}
      </section>
    );
  }

  const node = dialogue.nodes.find((n) => n.id === selected);
  // «Говорит» нужно только в разговоре очной ставки
  const nodeSkip = isConfrontation ? [] : ["speaker"];

  return (
    <section className={`dg ${fixedId ? "dg--embedded" : ""}`} style={panelVars(fixedId ? undefined : listPanel, sidePanel)}>
      {!fixedId && (listPanel.collapsed ? <PanelRail panel={listPanel} /> : (
          <EntityList
            items={ownDialogues}
            getKey={(d) => d.id}
            isActive={(d) => d.id === dialogue.id}
            onSelect={(d) => {
              setDialogueId(d.id);
              setSelected(null);
            }}
            onAdd={() => addDialogue(draft, setDialogueId)}
            note="Разговоры очных ставок — в разделе «Очные ставки», вкладка «Диалог»."
            renderItem={(d) => {
              const ch = draft.characters.find((c) => c.id === d.characterId);
              return (
                <>
                  {ch && (
                    <span className="ed__item-art">
                      <ArtThumb kind="look" id={ch.look} look={resolveLook(ch)} scale={1.5} />
                    </span>
                  )}
                  <ItemText title={ch?.name ?? d.characterId} id={d.id} />
                </>
              );
            }}
          />
      ))}

      <Graph
        dialogue={dialogue}
        draft={draft}
        positions={positions}
        hasSavedLayout={!!layout[dialogue.id]}
        selected={selected}
        onSelect={setSelected}
        onMove={(id, p) => setPositions({ ...positions, [id]: p })}
        onConnect={(nodeId, choiceId, target) =>
          updateDialogue((d) => ({
            ...d,
            nodes: d.nodes.map((n) =>
              n.id === nodeId ? { ...n, choices: n.choices.map((c) => (c.id === choiceId ? { ...c, next: target } : c)) } : n,
            ),
          }))
        }
        onAddNode={(p) => {
          const id = freeId("node_", dialogue.nodes.map((n) => n.id));
          updateDialogue((d) => ({
            ...d,
            nodes: [...d.nodes, { id, text: "Новая реплика", mood: "neutral", effects: [], choices: [{ id: "back", text: "Понятно.", next: d.startNodeId }] }],
          }));
          setPositions({ ...positions, [id]: p });
          setSelected(id);
        }}
        onAddChoice={(nodeId) =>
          updateDialogue((d) => ({
            ...d,
            nodes: d.nodes.map((n) =>
              n.id === nodeId ? { ...n, choices: [...n.choices, { id: freeId("c", n.choices.map((c) => c.id)), text: "Новый вариант", next: null }] } : n,
            ),
          }))
        }
        onAutoLayout={(heights) => setPositions(autoLayout(dialogue, heights))}
      />

      {sidePanel.collapsed ? (
        <PanelRail panel={sidePanel} />
      ) : (
        <aside className="dg__side">
          {!isConfrontation && (
            <DialogueTrigger
              draft={draft}
              dialogue={dialogue}
              onChange={(fn) => updateDialogue(fn)}
              onCreateZone={(locationId, zone) =>
                editor.update((c) => ({ ...c, locations: c.locations.map((l) => (l.id === locationId ? { ...l, zones: [...l.zones, zone] } : l)) }))
              }
            />
          )}
          {node ? (
            <>
              <div className="dg__side-head row">
                <h3>Реплика «{node.id}»</h3>
                {node.id !== dialogue.startNodeId && (
                  <button
                    className="btn btn--sm"
                    onClick={() => updateDialogue((d) => ({ ...d, startNodeId: node.id }))}
                    title="Разговор будет начинаться с этой реплики"
                  >
                    ★ сделать первой
                  </button>
                )}
                <button
                  className="btn btn--sm btn--danger"
                  onClick={async () => {
                    const ok = await ask({ title: `Удалить реплику «${node.id}»?`, text: "Варианты, ведущие в неё, станут концом разговора.", confirmLabel: "Удалить", danger: true });
                    if (!ok) return;
                    updateDialogue((d) => ({
                      ...d,
                      nodes: d.nodes
                        .filter((n) => n.id !== node.id)
                        .map((n) => ({ ...n, choices: n.choices.map((c) => (c.next === node.id ? { ...c, next: null } : c)) })),
                    }));
                    setSelected(null);
                  }}
                >
                  удалить
                </button>
              </div>
              <p className="muted dg__side-help">
                Реплика — то, что говорит персонаж. Ниже — варианты ответа игрока: у каждого «Дальше» — следующая реплика или
                «конец разговора».
              </p>
              <ObjectFields
                schema={NODE_SCHEMA}
                value={node}
                ctx={{ draft, dialogue }}
                skip={nodeSkip}
                onChange={(v) => {
                  const next = v as DialogueNode;
                  updateDialogue(
                    (d) => ({
                      ...d,
                      startNodeId: d.startNodeId === node.id ? next.id : d.startNodeId,
                      nodes: d.nodes.map((n) =>
                        n.id === node.id ? next : { ...n, choices: n.choices.map((c) => (c.next === node.id ? { ...c, next: next.id } : c)) },
                      ),
                    }),
                    `node:${dialogue.id}:${node.id}`,
                  );
                  if (next.id !== node.id) {
                    setSelected(next.id);
                    setPositions({ ...positions, [next.id]: positions[node.id] });
                  }
                }}
              />
            </>
          ) : (
            <>
              <h3>{isConfrontation ? "Разговор очной ставки" : "Диалог"}</h3>
              <ObjectFields
                schema={DIALOGUE_SCHEMA}
                value={dialogue}
                ctx={{ draft, dialogue }}
                skip={isConfrontation ? ["nodes", "id"] : ["nodes"]}
                onChange={(v) => {
                  const next = v as Dialogue;
                  if (next.id !== dialogue.id) setDialogueId(next.id);
                  updateDialogue(() => next, `dialogue:${dialogue.id}`);
                }}
              />
              <div className="dg__help">
                <p>
                  <b>Как устроен граф.</b> Карточка — реплика персонажа, строки под ней — варианты ответа игрока. Разговор
                  начинается с карточки <span className="dg-tag dg-tag--start">★ начало</span>.
                </p>
                <ul>
                  <li>Клик по карточке — редактировать; тяните за заголовок, чтобы двигать.</li>
                  <li>Тяните от кружка справа у варианта к карточке — так задаётся, что персонаж ответит дальше.</li>
                  <li>Отпустите на пустом месте — вариант станет <span className="dg-tag dg-tag--end">конец</span> разговора.</li>
                  <li>Двойной клик по пустому месту — новая реплика.</li>
                </ul>
              </div>
              {!isConfrontation && (
                <button
                  className="btn btn--sm btn--danger"
                  onClick={async () => {
                    if (!(await ask({ title: `Удалить диалог «${dialogue.id}»?`, confirmLabel: "Удалить", danger: true }))) return;
                    editor.update((c) => ({ ...c, dialogues: c.dialogues.filter((d) => d.id !== dialogue.id) }));
                    setDialogueId(ownDialogues.find((d) => d.id !== dialogue.id)?.id ?? "");
                  }}
                >
                  удалить диалог
                </button>
              )}
            </>
          )}
        </aside>
      )}
      {!fixedId && <PanelGrip panel={listPanel} />}
      <PanelGrip panel={sidePanel} />
    </section>
  );
}

const MOOD_LEGEND: DialogueNode["mood"][] = ["neutral", "friendly", "nervous", "angry", "sad"];

function Graph({
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

  const measured = () => Object.fromEntries([...cards.current].map(([id, el]) => [id, el.offsetHeight]));
  // первый показ диалога без сохранённой раскладки — раскладываем по настоящим высотам карточек
  useEffect(() => {
    if (!hasSavedLayout) onAutoLayout(measured());
  }, [dialogue.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="dg__canvas" style={{ width, height }} onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
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
                onClick={() => onSelect(n.id)}
              >
                <div
                  className="dg-node__head"
                  onMouseDown={(e) => {
                    const l = local(e);
                    setDrag({ id: n.id, dx: l.x - p.x, dy: l.y - p.y });
                    onSelect(n.id);
                  }}
                >
                  {n.id === dialogue.startNodeId && <span className="dg-tag dg-tag--start">★ начало</span>}
                  <b>{n.id}</b>
                  <span className={`dg-node__speaker ${multi ? "is-other" : ""}`}>{speakerName(n.speaker)}</span>
                </div>
                <div className="dg-node__text">{n.text}</div>
                {n.effects.length > 0 && (
                  <div className="dg-node__effects" title="Что произойдёт, когда прозвучит реплика">
                    ⚡ {n.effects.map(effectLabel).join("; ")}
                  </div>
                )}
                <ul className="dg-node__choices">
                  {n.choices.map((c, i) => (
                    <li key={c.id} className="dg-choice">
                      <span className="dg-choice__text">{c.text}</span>
                      {(c.requires || c.next === null) && (
                        <span className="dg-choice__tags">
                          {c.requires && (
                            <span className="dg-tag dg-tag--cond" title="Вариант виден только при выполнении условия">
                              условие
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

function effectLabel(e: DialogueNode["effects"][number]): string {
  switch (e.type) {
    case "addEvidence":
      return `улика ${e.evidenceId}`;
    case "setFlag":
      return `флаг ${e.flag}`;
    case "addCharacterNote":
      return `заметка о ${e.characterId}`;
    default:
      return `${ENUM_LABELS[e.type]} (${e.characterId})`;
  }
}

function freeId(prefix: string, taken: string[]) {
  for (let i = 1; ; i++) if (!taken.includes(`${prefix}${i}`)) return `${prefix}${i}`;
}

function addDialogue(draft: CaseFile, select: (id: string) => void) {
  const id = freeId("dlg_", draft.dialogues.map((d) => d.id));
  const characterId = draft.characters[0]?.id ?? "";
  editor.update((c) => ({
    ...c,
    dialogues: [
      ...c.dialogues,
      {
        id,
        characterId,
        startNodeId: "start",
        nodes: [
          { id: "start", text: "Здравствуйте.", mood: "neutral", effects: [], choices: [{ id: "bye", text: "До свидания.", next: null }] },
        ],
      },
    ],
  }));
  select(id);
}
