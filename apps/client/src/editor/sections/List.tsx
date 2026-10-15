import { useEffect } from "react";
import { CaseFile } from "../../../../../shared/case";
import { editor, editorStore, useEditor } from "../state";
import { useUrlParam, useWriteDefaultParam } from "../url";
import { Field, ObjectFields, defaultFor, itemTitle, type JS } from "../SchemaForm";
import { DialogueEditor } from "../DialogueGraph";
import { LookEditor } from "../LookEditor";
import type { Character, Confrontation, Evidence } from "../../../../../shared/case";
import { Icon } from "../../ui/icons";
import { Tabs } from "../Tabs";
import { EntityList, ItemText } from "../EntityList";
import { moveItem } from "../../util/lists";
import { ArtThumb } from "../Pickers";
import { resolveLook } from "../../game/art";
import { ask } from "../../ui/dialog";
import { SCHEMA, itemHeading, listActions } from "../shared";

export function ListSection({ field }: { field: keyof CaseFile }) {
  const draft = useEditor((s) => s.draft);
  const list = draft[field] as unknown as unknown[];
  const itemSchema: JS = SCHEMA.properties[field].items;
  // выбранный элемент и вкладка карточки — в адресе (`?item=…&tab=…`); вкладка не сбрасывается при переключении между элементами
  const [itemKey, setItemKey] = useUrlParam("item", "");
  const [evidenceTab, setEvidenceTab] = useUrlParam<EvidenceTab>("tab", "main", EVIDENCE_TABS.map((t) => t.id));
  const [confTab, setConfTab] = useUrlParam<"settings" | "dialogue">("tab", "settings", ["settings", "dialogue"]);
  const keyOf = (item: unknown, i: number) => String((item as { id?: string }).id ?? i);
  const found = list.findIndex((x, k) => keyOf(x, k) === itemKey);
  const index = found >= 0 ? found : Math.min(0, list.length - 1);
  useWriteDefaultParam("item", found >= 0, list.length ? keyOf(list[0], 0) : undefined);
  // выбрать элемент по номеру в актуальном списке (после добавления и сдвига он берётся из хранилища)
  const setSelected = (i: number) => {
    const now = editorStore.get().draft[field] as unknown as unknown[];
    setItemKey(now[i] === undefined ? "" : keyOf(now[i], i));
  };
  // переход к объекту с ошибкой
  const focus = useEditor((s) => s.focus);
  useEffect(() => {
    if (!focus?.id) return;
    const i = list.findIndex((x) => (x as { id?: string }).id === focus.id);
    if (i >= 0) setSelected(i);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (next: unknown[]) => editor.update((d) => ({ ...d, [field]: next }) as CaseFile, `${String(field)}:${index}`);

  const add = () => {
    if (field === "confrontations") editor.update((d) => addConfrontation(d));
    else {
      const fresh = defaultFor(itemSchema) as Record<string, unknown>;
      if ("id" in fresh) fresh.id = `${String(field).slice(0, 3)}_${list.length + 1}`;
      editor.update((d) => ({ ...d, [field]: [...list, fresh] }) as CaseFile);
    }
    setSelected(list.length);
  };
  const copy = (i: number) => {
    const c = structuredClone(list[i]) as Record<string, unknown>;
    if (typeof c.id === "string") c.id += "_copy";
    editor.update((d) => ({ ...d, [field]: [...list.slice(0, i + 1), c, ...list.slice(i + 1)] }) as CaseFile);
    setSelected(i + 1);
  };
  const move = (i: number, dir: -1 | 1) => {
    const next = moveItem(list, i, dir);
    if (!next) return;
    editor.update((d) => ({ ...d, [field]: next }) as CaseFile);
    setSelected(i + dir);
  };
  const remove = async (i: number) => {
    if (!(await ask({ title: `Удалить «${itemTitle(list[i], i)}»?`, confirmLabel: "Удалить", danger: true }))) return;
    // у очной ставки свой разговор — удаляем вместе с ней
    const dropDialogue = field === "confrontations" ? (list[i] as Confrontation).dialogueId : null;
    editor.update(
      (d) =>
        ({
          ...d,
          [field]: list.filter((_, k) => k !== i),
          dialogues: dropDialogue ? d.dialogues.filter((x) => x.id !== dropDialogue) : d.dialogues,
        }) as CaseFile,
    );
    setSelected(Math.max(0, Math.min(index, list.length - 2)));
  };
  listActions.current = { count: list.length, copy, move, remove };
  useEffect(() => () => void (listActions.current = null), []);

  const heading = (item: unknown, i: number) => {
    if (field !== "confrontations") return itemHeading(item, i);
    const conf = item as Confrontation;
    return conf.title || conf.characters.map((id) => draft.characters.find((c) => c.id === id)?.name.split(" ")[0] ?? id).join(", ");
  };

  return (
    <section className="ed__split">
      <EntityList
        items={list}
        getKey={(_, i) => i}
        isActive={(_, i) => i === index}
        onSelect={(_, i) => setSelected(i)}
        onAdd={add}
        empty="Пусто."
        renderItem={(item, i) => {
          const it = item as { id?: string; look?: string };
          return (
            <>
              {field === "characters" && (
                <span className="ed__item-art">
                  <ArtThumb kind="look" id={String(it.look)} look={resolveLook(item as Character)} scale={1.5} />
                </span>
              )}
              {field === "confrontations" && (
                <span className="ed__item-pair">
                  {(item as Confrontation).characters.slice(0, 3).map((id) => {
                    const ch = draft.characters.find((c) => c.id === id);
                    return ch ? <ArtThumb key={id} kind="look" id={ch.look} look={resolveLook(ch)} scale={1.2} /> : null;
                  })}
                </span>
              )}
              <ItemText title={heading(item, i)} id={it.id} />
            </>
          );
        }}
        tools={(_, i) => (
          <>
            <button onClick={() => copy(i)} title="Копия">
              <Icon name="copy" size={14} />
            </button>
            <button onClick={() => remove(i)} title="Удалить" className="is-danger">
              <Icon name="close" size={14} />
            </button>
          </>
        )}
      />
      {field === "confrontations" && list.length > 0 ? (
        <ConfrontationPanel
          key={index}
          tab={confTab}
          onTab={setConfTab}
          conf={list[index] as Confrontation}
          schema={itemSchema}
          onChange={(v) => update(list.map((x, i) => (i === index ? v : x)))}
        />
      ) : (
      <div className="ed__panel">
        {list.length === 0 ? (
          <p className="muted">Пусто. Нажмите «+ добавить».</p>
        ) : field === "evidence" ? (
          <EvidencePanel
            key={index}
            tab={evidenceTab}
            onTab={setEvidenceTab}
            evidence={list[index] as Evidence}
            schema={itemSchema}
            onChange={(v) => update(list.map((x, i) => (i === index ? v : x)))}
          />
        ) : field === "characters" ? (
          <>
            <ObjectFields
              schema={itemSchema}
              value={list[index]}
              ctx={{ draft }}
              skip={["look", "appearance"]}
              onChange={(v) => update(list.map((x, i) => (i === index ? v : x)))}
            />
            <h3 className="ed__subhead">Внешность</h3>
            <LookEditor
              character={list[index] as Character}
              others={(list as Character[]).filter((_, i) => i !== index)}
              onChange={(v) => update(list.map((x, i) => (i === index ? v : x)))}
            />
          </>
        ) : (
          <Field
            name={String(field)}
            schema={itemSchema}
            value={list[index]}
            ctx={{ draft }}
            bare
            onChange={(v) => update(list.map((x, i) => (i === index ? v : x)))}
          />
        )}
      </div>
      )}
    </section>
  );
}

const EVIDENCE_TABS = [
  { id: "main", label: "Основное", keys: ["id", "title", "kind", "subtype", "reliability", "description", "details"] },
  { id: "links", label: "Связи", keys: ["relatedCharacters", "relatedEvents"] },
  { id: "attachments", label: "Приложения", keys: ["attachments"] },
] as const;
type EvidenceTab = (typeof EVIDENCE_TABS)[number]["id"];

/** Где игрок получает улику: предметы и реплики, которые её выдают. */
function evidenceOrigins(d: CaseFile, id: string): string[] {
  const out: string[] = [];
  for (const l of d.locations)
    for (const o of l.objects) if (o.interaction?.evidenceId === id) out.push(`осмотр «${o.interaction.title}» — ${l.name}`);
  for (const dl of d.dialogues) {
    const who = d.characters.find((c) => c.id === dl.characterId)?.name ?? dl.characterId;
    for (const n of dl.nodes)
      if (n.effects.some((e) => e.type === "addEvidence" && e.evidenceId === id)) out.push(`разговор с ${who}, реплика «${n.id}»`);
  }
  return out;
}

function EvidencePanel({
  evidence,
  schema,
  tab,
  onTab: setTab,
  onChange,
}: {
  evidence: Evidence;
  schema: JS;
  tab: EvidenceTab;
  onTab: (t: EvidenceTab) => void;
  onChange: (v: unknown) => void;
}) {
  const draft = useEditor((s) => s.draft);
  const origins = evidenceOrigins(draft, evidence.id);
  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={EVIDENCE_TABS.map((t) => ({
          id: t.id,
          label: (
            <>
              {t.label}
              {t.id === "attachments" && evidence.attachments?.length ? <span className="ed__nav-count"> {evidence.attachments.length}</span> : null}
            </>
          ),
        }))}
      />
      {tab === "links" && (
        <div className="ed__note">
          <b>Где игрок получает:</b>{" "}
          {origins.length ? origins.join("; ") : <span className="is-warn">нигде — улику нельзя найти в игре</span>}
        </div>
      )}
      {tab === "attachments" && (
        <p className="muted">
          Фото, сканы, аудио, видео и ссылки — показываются в карточке улики. Для файла укажите адрес; для ссылки — адрес (http/https) и текст, который увидит игрок.
        </p>
      )}
      {tab === "main" ? (
        <div className="ef__fields">
          <ObjectFields schema={schema} value={evidence} ctx={{ draft }} only={["id", "title"]} onChange={onChange} />
          <div className="pair">
            <div className="ef">
              <span className="ef__label">Вид</span>
              <div className="seg">
                {(["evidence", "testimony"] as const).map((k) => (
                  <button key={k} className="seg__btn" aria-pressed={evidence.kind === k} onClick={() => onChange({ ...evidence, kind: k })}>
                    {k === "evidence" ? "Улика" : "Показания"}
                  </button>
                ))}
              </div>
            </div>
            <label className="ef">
              <span className="ef__label">Подпись</span>
              <input
                value={evidence.subtype ?? ""}
                placeholder={evidence.kind === "evidence" ? "Документ" : "—"}
                onChange={(e) => {
                  const { subtype: _old, ...rest } = evidence;
                  onChange(e.target.value ? { ...rest, subtype: e.target.value } : rest);
                }}
              />
            </label>
          </div>
          <ObjectFields schema={schema} value={evidence} ctx={{ draft }} only={["reliability", "description", "details"]} onChange={onChange} />
        </div>
      ) : (
        <ObjectFields schema={schema} value={evidence} ctx={{ draft }} only={[...EVIDENCE_TABS.find((t) => t.id === tab)!.keys]} onChange={onChange} />
      )}
    </>
  );
}

/** Новая очная ставка сразу со своим разговором. */
function addConfrontation(d: CaseFile): CaseFile {
  const free = (prefix: string, taken: string[]) => {
    for (let i = 1; ; i++) if (!taken.includes(`${prefix}${i}`)) return `${prefix}${i}`;
  };
  const id = free("conf_", d.confrontations.map((c) => c.id));
  const dialogueId = free("dlg_conf_", d.dialogues.map((x) => x.id));
  const [a, b] = d.characters;
  return {
    ...d,
    dialogues: [
      ...d.dialogues,
      {
        id: dialogueId,
        characterId: a?.id ?? "",
        startNodeId: "start",
        nodes: [
          { id: "start", text: "Зачем вы нас свели?", mood: "nervous", effects: [], choices: [{ id: "bye", text: "Пока всё.", next: null }] },
        ],
      },
    ],
    confrontations: [...d.confrontations, { id, characters: [a?.id, b?.id].filter(Boolean) as string[], dialogueId }],
  };
}

/** Очная ставка: настройки и её разговор — на соседних вкладках. */
function ConfrontationPanel({
  conf,
  schema,
  tab,
  onTab: setTab,
  onChange,
}: {
  conf: Confrontation;
  schema: JS;
  tab: "settings" | "dialogue";
  onTab: (t: "settings" | "dialogue") => void;
  onChange: (v: unknown) => void;
}) {
  const draft = useEditor((s) => s.draft);
  const focus = useEditor((s) => s.focus);
  useEffect(() => {
    if (focus?.section === "confrontations" && focus.id === conf.id) setTab(focus.sub ? "dialogue" : "settings");
  }, [focus, conf.id, setTab]);
  return (
    <div className="conf-panel">
      <Tabs
        variant="bar"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "settings", label: "Настройки" },
          { id: "dialogue", label: "Разговор" },
        ]}
      />
      {tab === "settings" ? (
        <div className="ed__panel ed__panel--narrow">
          <p className="muted">
            Очная ставка начинается, когда игрок приводит всех участников, кроме одного, к нему (они идут следом) и заговаривает
            с ним. Реплики участников — на вкладке «Разговор».
          </p>
          <ObjectFields schema={schema} value={conf} ctx={{ draft }} only={["id", "title"]} onChange={onChange} />
          <ObjectFields schema={schema} value={conf} ctx={{ draft }} only={["characters"]} onChange={onChange} />
          <ObjectFields schema={schema} value={conf} ctx={{ draft }} only={["requires"]} onChange={onChange} />
        </div>
      ) : (
        <DialogueEditor fixedId={conf.dialogueId} />
      )}
    </div>
  );
}
