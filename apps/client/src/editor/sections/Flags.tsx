import { useState } from "react";
import { CaseFile } from "../../../../../shared/case";
import { editor, useEditor } from "../state";
import { deleteFlag, flagUsage, type FlagUse } from "../SchemaForm";
import { NewVariableDialog } from "../fields/NewVariable";
import { renameKey, toKey } from "../keys";
import { useUrlParam, useWriteDefaultParam } from "../url";
import { Icon } from "../../ui/icons";
import { EntityList, ItemText } from "../EntityList";
import { ask, tell } from "../../ui/dialog";
import { UsageList } from "../fields/UsageList";
import { KeyInput, keyChars } from "../fields/KeyInput";
import { CounterEditor } from "./Counters";
import { EnumEditor } from "./Enums";
import { useFocusJump } from "../useFocusJump";

type Entry = { kind: "flag" | "counter" | "enum"; id: string };

/** Переменные дела одним списком: значок — тип (флаг, счётчик; позже — другие); слева список, справа правка. */
export function FlagsSection() {
  const draft = useEditor((s) => s.draft);
  const [dialog, setDialog] = useState<"new" | null>(null);
  const usage = flagUsage(draft);
  const nameOf = (id: string) => draft.flags?.find((f) => f.id === id)?.name ?? "";
  const flagIds = [...new Set([...(draft.flags ?? []).map((f) => f.id), ...usage.keys()])].sort((a, b) => (nameOf(a) || "я").localeCompare(nameOf(b) || "я", "ru"));
  const counters = [...(draft.counters ?? [])].sort((a, b) => (a.name || "я").localeCompare(b.name || "я", "ru"));
  const enums = [...(draft.enums ?? [])].sort((a, b) => (a.name || "я").localeCompare(b.name || "я", "ru"));
  const entries: Entry[] = [
    ...flagIds.map((id) => ({ kind: "flag" as const, id })),
    ...counters.map((c) => ({ kind: "counter" as const, id: c.id })),
    ...enums.map((e) => ({ kind: "enum" as const, id: e.id })),
  ];
  const [selected, setSelected] = useUrlParam("item", ""); // выбранный флаг или счётчик — в адресе
  useFocusJump((focus) => {
    if (focus.section === "flags" && focus.id) setSelected(focus.id);
  });
  const current = entries.find((e) => e.id === selected) ?? entries[0] ?? null;
  useWriteDefaultParam("item", current?.id === selected, entries[0]?.id);

  return (
    <section className="ed__split">
      <EntityList
        items={entries}
        getKey={(e) => `${e.kind}:${e.id}`}
        isActive={(e) => e.id === current?.id}
        onSelect={(e) => setSelected(e.id)}
        onAdd={() => setDialog("new")}
        addLabel="Добавить переменную"
        empty="Переменных пока нет."
        renderItem={(e) =>
          e.kind === "flag" ? (
            <>
              <span className="ed__item-kind" title="Флаг">
                <Icon name="flag" size={16} />
              </span>
              <ItemText title={nameOf(e.id) || "без названия"} id={e.id} warn={!nameOf(e.id)} />
            </>
          ) : e.kind === "enum" ? (
            <>
              <span className="ed__item-kind" title="Перечисление">
                <Icon name="list" size={16} />
              </span>
              <ItemText title={enums.find((x) => x.id === e.id)?.name || "без названия"} id={e.id} warn={!enums.find((x) => x.id === e.id)?.name} />
            </>
          ) : (
            <>
              <span className="ed__item-kind" title="Счётчик">
                <Icon name="counter" size={16} />
              </span>
              <ItemText title={counters.find((c) => c.id === e.id)?.name || "без названия"} id={e.id} warn={!counters.find((c) => c.id === e.id)?.name} />
            </>
          )
        }
      />
      <div className="ed__panel ed__panel--narrow">
        {current?.kind === "flag" ? (
          <FlagEditor key={current.id} id={current.id} name={nameOf(current.id)} uses={usage.get(current.id) ?? []} onRenamed={setSelected} />
        ) : current?.kind === "enum" ? (
          <EnumEditor key={current.id} def={enums.find((x) => x.id === current.id)!} uses={usage.get(current.id) ?? []} onRenamed={setSelected} />
        ) : current ? (
          <CounterEditor key={current.id} counter={counters.find((c) => c.id === current.id)!} uses={usage.get(current.id) ?? []} onRenamed={setSelected} />
        ) : (
          <p className="muted">
            Флаг — пометка «это уже произошло»: его ставят эффекты, а проверяют условия. Счётчик — число (очки доверия, попытки): эффекты прибавляют или задают его, условия проверяют границы.
            Перечисление — одно значение из списка (сейф: закрыт / открыт / сломан): эффекты выбирают значение, условия проверяют его.
          </p>
        )}
      </div>
      {dialog === "new" && (
        <NewVariableDialog
          onDone={(id) => {
            setDialog(null);
            if (id) setSelected(id);
          }}
        />
      )}
    </section>
  );
}

function FlagEditor({ id, name, uses, onRenamed }: { id: string; name: string; uses: FlagUse[]; onRenamed: (id: string) => void }) {
  const draft = useEditor((s) => s.draft);
  const setName = (v: string) => editor.update((d) => ({ ...d, flags: [...(d.flags ?? []).filter((f) => f.id !== id), { ...(d.flags ?? []).find((f) => f.id === id), id, name: v }] }), `flag:${id}`);
  const commitKey = async (next: string) => {
    if (flagUsage(draft).has(next) || draft.flags?.some((f) => f.id === next) || draft.counters?.some((c) => c.id === next) || draft.enums?.some((e) => e.id === next)) {
      await tell({ title: "Такой флаг уже есть", text: `Ключ «${next}» занят — выберите другой.` });
      return false;
    }
    if (uses.length) {
      const ok = await ask({
        title: "Переименовать ключ флага?",
        text: `Флаг используется в ${uses.length} мест(ах). Ключ «${id}» заменится на «${next}» во всех ссылках.`,
        confirmLabel: "Переименовать",
      });
      if (!ok) return false;
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
        <input value={name} placeholder="Название флага" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="ef">
        <span className="ef__label">Ключ (смена обновит все ссылки — с подтверждением)</span>
        <KeyInput value={id} suggestion={name ? toKey(name) : undefined} commit={commitKey} normalize={(v) => keyChars(v).toLowerCase()} />
      </div>
      <label className="ef ef--bool">
        <input
          type="checkbox"
          checked={!!draft.flags?.find((f) => f.id === id)?.initial}
          onChange={(e) => editor.update((d) => ({ ...d, flags: [...(d.flags ?? []).filter((f) => f.id !== id), { id, name, ...(e.target.checked ? { initial: true } : {}) }] }))}
        />
        Стоит с начала расследования
      </label>
      <UsageList uses={uses} />
      <button className="btn btn--danger flag-ed__delete" onClick={remove}>
        Удалить флаг
      </button>
    </div>
  );
}

type LawRef = NonNullable<CaseFile["lawReference"]>;
export type LawItemT = LawRef["basis"][number] & LawRef["notes"][number];
