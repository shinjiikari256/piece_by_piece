import { useEffect, useState } from "react";
import { CaseFile } from "../../../../../shared/case";
import { editor, useEditor } from "../state";
import { FlagDialog, deleteFlag, flagUsage, type FlagUse } from "../SchemaForm";
import { renameKey, toKey } from "../keys";
import { useUrlParam, useWriteDefaultParam } from "../url";
import { Icon } from "../../ui/icons";
import { EntityList, ItemText } from "../EntityList";
import { ask, tell } from "../../ui/dialog";

/** Флаги: слева список (название и ключ), справа — правка и где используется. */
export function FlagsSection() {
  const draft = useEditor((s) => s.draft);
  const focus = useEditor((s) => s.focus);
  const [dialog, setDialog] = useState(false);
  const usage = flagUsage(draft);
  const nameOf = (id: string) => draft.flags?.find((f) => f.id === id)?.name ?? "";
  const ids = [...new Set([...(draft.flags ?? []).map((f) => f.id), ...usage.keys()])].sort((a, b) =>
    (nameOf(a) || "я").localeCompare(nameOf(b) || "я", "ru"),
  );
  const [selected, setSelected] = useUrlParam("item", ""); // выбранный флаг — в адресе
  useEffect(() => {
    if (focus?.section === "flags" && focus.id) setSelected(focus.id);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = selected && ids.includes(selected) ? selected : (ids[0] ?? null);
  useWriteDefaultParam("item", current === selected, ids[0]);

  return (
    <section className="ed__split">
      <EntityList
        items={ids}
        getKey={(id) => id}
        isActive={(id) => id === current}
        onSelect={(id) => setSelected(id)}
        onAdd={() => setDialog(true)}
        addLabel="Добавить флаг"
        empty="Флагов пока нет."
        renderItem={(id) => <ItemText title={nameOf(id) || "без названия"} id={id} warn={!nameOf(id)} />}
      />
      <div className="ed__panel ed__panel--narrow">
        {current ? (
          <FlagEditor key={current} id={current} name={nameOf(current)} uses={usage.get(current) ?? []} onRenamed={setSelected} />
        ) : (
          <p className="muted">Флаг — пометка «это уже произошло». Его ставят эффекты, а проверяют условия.</p>
        )}
      </div>
      {dialog && (
        <FlagDialog
          onDone={(f) => {
            setDialog(false);
            if (f) setSelected(f);
          }}
        />
      )}
    </section>
  );
}

function FlagEditor({ id, name, uses, onRenamed }: { id: string; name: string; uses: FlagUse[]; onRenamed: (id: string) => void }) {
  const draft = useEditor((s) => s.draft);
  const [key, setKey] = useState(id);
  const setName = (v: string) =>
    editor.update((d) => ({ ...d, flags: [...(d.flags ?? []).filter((f) => f.id !== id), { id, name: v }] }), `flag:${id}`);
  const commitKey = async () => {
    const next = key.trim();
    if (!next || next === id) return setKey(id);
    if (flagUsage(draft).has(next) || draft.flags?.some((f) => f.id === next)) {
      setKey(id);
      return tell({ title: "Такой флаг уже есть", text: `Ключ «${next}» занят — выберите другой.` });
    }
    if (uses.length) {
      const ok = await ask({
        title: "Переименовать ключ флага?",
        text: `Флаг используется в ${uses.length} мест(ах). Ключ «${id}» заменится на «${next}» во всех ссылках.`,
        confirmLabel: "Переименовать",
      });
      if (!ok) return setKey(id);
    }
    editor.update((d) => {
      const renamed = renameKey(d as unknown as Record<string, unknown>, id, next) as unknown as CaseFile;
      // флаг мог не быть в списке (только в ссылках) — заносим с названием
      return renamed.flags?.some((f) => f.id === next) ? renamed : { ...renamed, flags: [...(renamed.flags ?? []), { id: next, name }] };
    });
    onRenamed(next);
  };
  const remove = async () => {
    const ok = await ask({
      title: `Удалить флаг «${name || id}»?`,
      text: uses.length
        ? `Флаг используется в ${uses.length} мест(ах). Эффекты «поставить флаг» удалятся, а из условий он исчезнет.\nЕсли в условии он был единственным — пропадёт и сама проверка: вариант или дверь станут доступны всегда.`
        : "Флаг нигде не используется.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    editor.update((d) => deleteFlag(d, id));
  };
  return (
    <div className="flag-ed">
      <label className="ef">
        <span className="ef__label">Название — что означает флаг</span>
        <input value={name} placeholder="Тимур отдал ключ от комнаты 412" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="ef">
        <span className="ef__label">Ключ (смена обновит все ссылки — с подтверждением)</span>
        <div className="key-field row">
          <input
            className="key-field__input"
            value={key}
            onChange={(e) => setKey(e.target.value.replace(/[^\w-]+/g, "_").toLowerCase())}
            onBlur={commitKey}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitKey();
              if (e.key === "Escape") setKey(id);
            }}
          />
          {name && toKey(name) !== id && (
            <button className="btn btn--sm btn--icon" onClick={() => setKey(toKey(name))} title="Сгенерировать из названия (применится по Enter)" aria-label="Сгенерировать из названия">
              <Icon name="sparkle" size={16} />
            </button>
          )}
        </div>
      </label>
      <div className="ef">
        <span className="ef__label">Где используется ({uses.length})</span>
        {uses.length ? (
          <ul className="flag-uses">
            {uses.map((u, i) => (
              <li key={i}>
                <button className="flag-use" onClick={() => editor.goto(u.focus.section, u.focus)} title="Перейти">
                  <span className="flag-use__kind" data-tone={u.kind === "ставит" ? "good" : undefined}>{u.kind}</span>
                  <span className="flag-use__where">{u.where}</span>
                  <Icon name="back" size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Нигде не используется.</p>
        )}
      </div>
      <button className="btn btn--danger flag-ed__delete" onClick={remove}>
        Удалить флаг
      </button>
    </div>
  );
}

type LawRef = NonNullable<CaseFile["lawReference"]>;
export type LawItemT = LawRef["basis"][number] & LawRef["notes"][number];
