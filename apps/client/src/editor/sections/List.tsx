import { UsageList } from "../fields/UsageList";
import { evidenceUsage } from "../fields/Conditions";
import { effectSites } from "../../../../../shared/effect-sites";
import { useEffect } from "react";
import { CaseFile } from "../../../../../shared/case";
import { editor, editorStore, useEditor } from "../state";
import { useUrlParam, useWriteDefaultParam } from "../url";
import { Field, ObjectFields, defaultFor, itemTitle, type JS } from "../SchemaForm";
import { LookEditor } from "../LookEditor";
import type { Character, CaseEvent, Evidence } from "../../../../../shared/case";
import { Icon } from "../../ui/icons";
import { Tabs } from "../Tabs";
import { EntityList, ItemText } from "../EntityList";
import { moveItem } from "../../util/lists";
import { ArtThumb } from "../Pickers";
import { resolveLook } from "../../game/art";
import { ask } from "../../ui/dialog";
import { EventWhen } from "../fields/EventTime";
import { SCHEMA, itemHeading, listActions } from "../shared";

/** Событие с новым временем; пустой конец в дело не пишется. */
function withWhen(ev: CaseEvent, when: { at: string; until?: string }): CaseEvent {
  const { until: _old, ...rest } = ev;
  return { ...rest, at: when.at, ...(when.until === undefined ? {} : { until: when.until }) };
}

export function ListSection({ field }: { field: keyof CaseFile }) {
  const draft = useEditor((s) => s.draft);
  const list = draft[field] as unknown as unknown[];
  const itemSchema: JS = SCHEMA.properties[field].items;
  // выбранный элемент и вкладка карточки — в адресе (`?item=…&tab=…`); вкладка не сбрасывается при переключении между элементами
  const [itemKey, setItemKey] = useUrlParam("item", "");
  const [evidenceTab, setEvidenceTab] = useUrlParam<EvidenceTab>("tab", "main", EVIDENCE_TABS.map((t) => t.id));
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
    const fresh = defaultFor(itemSchema) as Record<string, unknown>;
    if (field === "events") fresh.at = "01-01";
    if ("id" in fresh) fresh.id = `${String(field).slice(0, 3)}_${list.length + 1}`;
    editor.update((d) => ({ ...d, [field]: [...list, fresh] }) as CaseFile);
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
    editor.update((d) => ({ ...d, [field]: list.filter((_, k) => k !== i) }) as CaseFile);
    setSelected(Math.max(0, Math.min(index, list.length - 2)));
  };
  listActions.current = { count: list.length, copy, move, remove };
  useEffect(() => () => void (listActions.current = null), []);

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
              <ItemText title={itemHeading(item, i)} id={it.id} />
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
        ) : field === "events" ? (
          <>
            <ObjectFields schema={itemSchema} value={list[index]} ctx={{ draft }} only={["id", "title"]} onChange={(v) => update(list.map((x, i) => (i === index ? v : x)))} />
            <EventWhen
              at={(list[index] as CaseEvent).at}
              until={(list[index] as CaseEvent).until}
              onChange={(w) => update(list.map((x, i) => (i === index ? withWhen(x as CaseEvent, w) : x)))}
            />
            <ObjectFields schema={itemSchema} value={list[index]} ctx={{ draft }} only={["requires"]} onChange={(v) => update(list.map((x, i) => (i === index ? v : x)))} />
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
    </section>
  );
}

const EVIDENCE_TABS = [
  { id: "main", label: "Основное", keys: ["id", "title", "kind", "subtype", "reliability", "description", "details"] },
  { id: "links", label: "Связи", keys: ["relatedCharacters", "relatedEvents"] },
  { id: "attachments", label: "Приложения", keys: ["attachments"] },
] as const;
type EvidenceTab = (typeof EVIDENCE_TABS)[number]["id"];

/** Где игрок получает улику: любое место дела, где есть эффект «добавить улику в дело» с ней. */
function evidenceOrigins(d: CaseFile, id: string): string[] {
  const who = (characterId: string) => d.characters.find((c) => c.id === characterId)?.name ?? characterId;
  const out: string[] = [];
  for (const site of effectSites(d)) {
    if (!site.effects.some((e) => e.type === "addEvidence" && e.evidenceId === id)) continue;
    const o = site.owner;
    if (o.kind === "node") out.push(`разговор с ${who(o.characterId)}, реплика «${o.nodeId}»`);
    else if (o.kind === "choice") out.push(`разговор с ${who(o.characterId)}, вариант «${o.text.slice(0, 40)}»`);
    else if (o.kind === "object") out.push(`осмотр «${o.label}» — ${o.locationName}`);
    else if (o.kind === "zone") out.push(`область «${o.zoneName}» — ${o.locationName}`);
    else if (o.kind === "zoneFallback") out.push(`запасной ответ области «${o.zoneName}» — ${o.locationName}`);
    else if (o.kind === "enter") out.push(`вход в локацию «${o.locationName}»`);
    else if (o.kind === "deduction") out.push(`сопоставление «${o.title}»`);
    else if (o.kind === "deductionFail") out.push(`ошибка в сопоставлении «${o.title}»`);
    else if (o.kind === "evidence") out.push(`получение улики «${o.title}»`);
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
                {(["evidence", "testimony", "item"] as const).map((k) => (
                  <button key={k} className="seg__btn" aria-pressed={evidence.kind === k} onClick={() => onChange({ ...evidence, kind: k })}>
                    {k === "evidence" ? "Улика" : k === "testimony" ? "Показания" : "Предмет"}
                  </button>
                ))}
              </div>
            </div>
            <label className="ef">
              <span className="ef__label">Подпись</span>
              <input
                value={evidence.subtype ?? ""}
                placeholder={evidence.kind === "evidence" ? "Документ" : evidence.kind === "item" ? "Ключ" : "—"}
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
        <>
          <ObjectFields schema={schema} value={evidence} ctx={{ draft }} only={[...EVIDENCE_TABS.find((t) => t.id === tab)!.keys]} onChange={onChange} />
          {tab === "links" && <UsageList uses={(evidenceUsage(draft).get(evidence.id) ?? []).filter((u) => u.kind !== "выдаёт")} />}
        </>
      )}
    </>
  );
}
