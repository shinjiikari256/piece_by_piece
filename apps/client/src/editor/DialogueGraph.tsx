import { formSchema } from "./json-schema";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Dialogue as DialogueSchema, DialogueNode as NodeSchema } from "../../../../shared/case";
import type { CaseFile, Dialogue, DialogueNode } from "../../../../shared/case";
import { editor, useEditor } from "./state";
import { ObjectFields, type JS } from "./SchemaForm";
import { ArtThumb } from "./Pickers";
import { EntityList, ItemText } from "./EntityList";
import { PanelGrip, PanelRail, panelVars, usePanel } from "./panels";
import { DialogueTrigger } from "./fields/DialogueTrigger";
import { dialogueLinks } from "./map/actions";
import { setSearchParams } from "../ui/router";
import { Icon } from "../ui/icons";
import { useUrlParam, useWriteDefaultParam } from "./url";
import { resolveLook } from "../game/art";
import { ask } from "../ui/dialog";
import { autoLayout, loadLayout, saveLayout, type Layout, type Pos } from "./dialogue-layout";
import { freeId } from "../util/ids";
import { Graph } from "./DialogueCanvas";
import { useFocusJump } from "./useFocusJump";

const NODE_SCHEMA: JS = formSchema(NodeSchema);
const DIALOGUE_SCHEMA: JS = formSchema(DialogueSchema);

/** Строка под диалогом в списке: кто и что его запускает; «не подключён» — предупреждение. */
function linkNote(draft: CaseFile, dialogueId: string): { note: ReactNode; warn?: boolean } {
  const { people, zones } = dialogueLinks(draft, dialogueId);
  if (!people.length && !zones.length) return { note: <span className="is-warn">не подключён: его никто не запустит</span> };
  return { note: [people.length ? `☺ ${people.join(", ")}` : "", zones.length ? `▦ ${zones.join(", ")}` : ""].filter(Boolean).join(" · ") };
}

/** Редактор диалога-графа: раздел «Диалоги» со списком разговоров и графом реплик. */
export function DialogueEditor() {
  const listPanel = usePanel("dialogue-list", "Диалоги", "left", { width: 240, min: 160, max: 420 });
  const sidePanel = usePanel("dialogue-node", "Реплика", "right", { width: 384, min: 280, max: 640 });
  const draft = useEditor((s) => s.draft);
  const ownDialogues = draft.dialogues;
  // выбранный разговор и узел — в адресе (`?item=…&node=…`)
  const [urlDialogue] = useUrlParam("item", "");
  const [urlNode] = useUrlParam("node", "");
  const pickedId = ownDialogues.some((d) => d.id === urlDialogue) ? urlDialogue : (ownDialogues[0]?.id ?? "");
  const setDialogueId = (id: string) => setSearchParams({ item: id === ownDialogues[0]?.id ? null : id, node: null });
  useWriteDefaultParam("item", pickedId === urlDialogue, ownDialogues[0]?.id);
  const dlgIndex = draft.dialogues.findIndex((d) => d.id === pickedId);
  const dialogue = dlgIndex >= 0 ? draft.dialogues[dlgIndex] : ownDialogues[0];
  const selected = urlNode || null;
  const setSelected = (id: string | null) => setSearchParams({ node: id });
  // на телефоне список и реплика — поверх графа: какой из них открыт (на широком экране не влияет)
  const [view, setView] = useState<"graph" | "list" | "node">("graph");
  useEffect(() => {
    if (selected) setView("node");
  }, [selected]);
  // переход к узлу с ошибкой
  useFocusJump((focus) => {
    if (focus.id && focus.section === "dialogues") {
      setDialogueId(focus.id);
      setSelected(focus.sub ?? null);
    }
  });
  const [layout, setLayout] = useState<Layout>(() => loadLayout(draft.id));
  useEffect(() => setLayout(loadLayout(draft.id)), [draft.id]);

  const updateDialogue = (fn: (d: Dialogue) => Dialogue, merge?: string) => editor.update((c) => ({ ...c, dialogues: c.dialogues.map((d) => (d.id === dialogue?.id ? fn(d) : d)) }), merge);

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
        <p>Диалогов нет.</p>
        <button className="btn btn--sm" onClick={() => addDialogue(draft, setDialogueId)}>
          + диалог
        </button>
      </section>
    );
  }

  const node = dialogue.nodes.find((n) => n.id === selected);
  return (
    <section className="dg" data-view={view} data-list-collapsed={listPanel.collapsed || undefined} data-side-collapsed={sidePanel.collapsed || undefined} style={panelVars(listPanel, sidePanel)}>
      {listPanel.collapsed && <PanelRail panel={listPanel} />}
      <div className="dg__list">
        <button className="btn btn--sm dg__phone-close" onClick={() => setView("graph")}>
          <Icon name="back" size={14} /> К графу
        </button>
        <EntityList
          items={ownDialogues}
          getKey={(d) => d.id}
          isActive={(d) => d.id === dialogue.id}
          onSelect={(d) => {
            setDialogueId(d.id);
            setSelected(null);
          }}
          onAdd={() => addDialogue(draft, setDialogueId)}
          renderItem={(d) => {
            const ch = draft.characters.find((c) => c.id === d.characterId);
            return (
              <>
                {ch && (
                  <span className="ed__item-art">
                    <ArtThumb kind="look" id={ch.look} look={resolveLook(ch)} scale={1.5} />
                  </span>
                )}
                <ItemText title={ch?.name ?? d.characterId} id={d.id} {...linkNote(draft, d.id)} />
              </>
            );
          }}
        />
      </div>

      <Graph
        dialogue={dialogue}
        phone={
          <div className="dg__phone-nav">
            <button className="btn btn--sm" onClick={() => setView("list")}>
              Диалоги
            </button>
            <button className="btn btn--sm" onClick={() => setView("node")}>
              Реплика
            </button>
          </div>
        }
        draft={draft}
        positions={positions}
        hasSavedLayout={!!layout[dialogue.id]}
        selected={selected}
        onSelect={setSelected}
        onMove={(id, p) => setPositions({ ...positions, [id]: p })}
        onConnect={(nodeId, choiceId, target) =>
          updateDialogue((d) => ({
            ...d,
            nodes: d.nodes.map((n) => (n.id === nodeId ? { ...n, choices: n.choices.map((c) => (c.id === choiceId ? { ...c, next: target } : c)) } : n)),
          }))
        }
        onAddNode={(p) => {
          const id = freeId(
            "node_",
            dialogue.nodes.map((n) => n.id),
          );
          updateDialogue((d) => ({
            ...d,
            nodes: [...d.nodes, { id, text: "Новая реплика", mood: "neutral", effects: [], choices: [{ id: "back", text: "Понятно.", next: d.startNodeId, effects: [] }] }],
          }));
          setPositions({ ...positions, [id]: p });
          setSelected(id);
        }}
        onAddChoice={(nodeId) =>
          updateDialogue((d) => ({
            ...d,
            nodes: d.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    choices: [
                      ...n.choices,
                      {
                        id: freeId(
                          "c",
                          n.choices.map((c) => c.id),
                        ),
                        text: "Новый вариант",
                        next: null,
                        effects: [],
                      },
                    ],
                  }
                : n,
            ),
          }))
        }
        onAutoLayout={(heights) => setPositions(autoLayout(dialogue, heights))}
      />

      {sidePanel.collapsed && <PanelRail panel={sidePanel} />}
      <aside className="dg__side">
        <button className="btn btn--sm dg__phone-close" onClick={() => setView("graph")}>
          <Icon name="back" size={14} /> К графу
        </button>
        <DialogueTrigger draft={draft} dialogue={dialogue} />
        {node ? (
          <>
            <div className="dg__side-head row">
              <h3>Реплика «{node.id}»</h3>
              {node.id !== dialogue.startNodeId && (
                <button className="btn btn--sm" onClick={() => updateDialogue((d) => ({ ...d, startNodeId: node.id }))} title="Разговор будет начинаться с этой реплики">
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
                    nodes: d.nodes.filter((n) => n.id !== node.id).map((n) => ({ ...n, choices: n.choices.map((c) => (c.next === node.id ? { ...c, next: null } : c)) })),
                  }));
                  setSelected(null);
                }}
              >
                удалить
              </button>
            </div>
            <p className="muted dg__side-help">Реплика — то, что говорит персонаж. Ниже — варианты ответа игрока: у каждого «Дальше» — следующая реплика или «конец разговора».</p>
            <ObjectFields
              schema={NODE_SCHEMA}
              value={node}
              ctx={{ draft, dialogue }}
              onChange={(v) => {
                const next = v as DialogueNode;
                updateDialogue(
                  (d) => ({
                    ...d,
                    startNodeId: d.startNodeId === node.id ? next.id : d.startNodeId,
                    nodes: d.nodes.map((n) => (n.id === node.id ? next : { ...n, choices: n.choices.map((c) => (c.next === node.id ? { ...c, next: next.id } : c)) })),
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
            <h3>Диалог</h3>
            <ObjectFields
              schema={DIALOGUE_SCHEMA}
              value={dialogue}
              ctx={{ draft, dialogue }}
              skip={["nodes"]}
              onChange={(v) => {
                const next = v as Dialogue;
                if (next.id !== dialogue.id) setDialogueId(next.id);
                updateDialogue(() => next, `dialogue:${dialogue.id}`);
              }}
            />
            <div className="dg__help">
              <p>
                <b>Как устроен граф.</b> Карточка — реплика персонажа, строки под ней — варианты ответа игрока. Разговор начинается с карточки <span className="dg-tag dg-tag--start">★ начало</span>.
              </p>
              <ul>
                <li>Клик по карточке — редактировать; тяните за заголовок, чтобы двигать.</li>
                <li>Тяните от кружка справа у варианта к карточке — так задаётся, что персонаж ответит дальше.</li>
                <li>
                  Отпустите на пустом месте — вариант станет <span className="dg-tag dg-tag--end">конец</span> разговора.
                </li>
                <li>Двойной клик по пустому месту — новая реплика.</li>
              </ul>
            </div>
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
          </>
        )}
      </aside>
      <PanelGrip panel={listPanel} />
      <PanelGrip panel={sidePanel} />
    </section>
  );
}

function addDialogue(draft: CaseFile, select: (id: string) => void) {
  const id = freeId(
    "dlg_",
    draft.dialogues.map((d) => d.id),
  );
  const characterId = draft.characters[0]?.id ?? "";
  editor.update((c) => ({
    ...c,
    dialogues: [
      ...c.dialogues,
      {
        id,
        characterId,
        startNodeId: "start",
        nodes: [{ id: "start", text: "Здравствуйте.", mood: "neutral", effects: [], choices: [{ id: "bye", text: "До свидания.", next: null, effects: [] }] }],
      },
    ],
  }));
  select(id);
}
