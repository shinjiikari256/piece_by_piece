import { useState } from "react";
import { editor, useEditor } from "../state";
import { Icon } from "../../ui/icons";
import { Tabs } from "../Tabs";
import { LawItemT } from "./Flags";

/** Вкладка «Закон» у игрока: правовая база и пояснения — нумерованные списки. */
export function LawSection() {
  const draft = useEditor((s) => s.draft);
  const [tab, setTab] = useState<"basis" | "notes">("basis");
  const ref = draft.lawReference ?? { basis: [], notes: [] };
  const items = ref[tab] as LawItemT[];
  const setItems = (next: LawItemT[]) => editor.update((d) => ({ ...d, lawReference: { ...ref, [tab]: next } }), `law:${tab}`);
  const set = (i: number, patch: Partial<LawItemT>) => {
    const next: LawItemT[] = items.map((x, k) => (k === i ? { ...x, ...patch } : x));
    // пустые необязательные поля не храним
    for (const key of ["text", "url", "article", "subtitle"] as const) if (next[i][key] === "") delete next[i][key];
    setItems(next);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };
  return (
    <section className="conf-panel">
      <Tabs
        variant="bar"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "basis", label: <>Правовая база <span className="ed__nav-count">{ref.basis.length}</span></> },
          { id: "notes", label: <>Пояснения <span className="ed__nav-count">{ref.notes.length}</span></> },
        ]}
      />
      <div className="ed__panel ed__panel--narrow">
        <p className="muted">
          {tab === "basis"
            ? "Статьи нормативных актов, другие документы. Это подсказка, а не ответ: добавьте и соседние нормы."
            : "Любые комментарии автора. Номер пояснения виден игроку — на него можно сослаться в подсказке: «см. пояснение №2»."}
        </p>
        <ol className="law-ed">
          {items.map((x, i) => (
            <li key={i} className="law-ed__item">
              <span className="law-ed__num">{i + 1}</span>
              <div className="law-ed__fields stack">
                {tab === "basis" && (
                  <input
                    className="law-ed__chip"
                    value={(x as { article?: string }).article ?? ""}
                    placeholder="Статья для чипа: ч. 1 ст. 137 УК РФ"
                    onChange={(e) => set(i, { article: e.target.value } as Partial<LawItemT>)}
                  />
                )}
                <input
                  className="law-ed__title"
                  value={x.title}
                  placeholder={tab === "basis" ? "Право на неприкосновенность частной жизни" : "Дисциплинарное нарушение"}
                  onChange={(e) => set(i, { title: e.target.value })}
                />
                {tab === "notes" && (
                  <input
                    value={(x as { subtitle?: string }).subtitle ?? ""}
                    placeholder="Подзаголовок (необязательно)"
                    onChange={(e) => set(i, { subtitle: e.target.value } as Partial<LawItemT>)}
                  />
                )}
                <textarea rows={3} value={x.text ?? ""} placeholder="Текст (необязательно)" onChange={(e) => set(i, { text: e.target.value })} />
                <input value={x.url ?? ""} placeholder="Ссылка (необязательно)" onChange={(e) => set(i, { url: e.target.value })} />
              </div>
              <div className="law-ed__tools">
                <button className="btn btn--sm" disabled={i === 0} onClick={() => move(i, -1)} title="Выше">
                  ↑
                </button>
                <button className="btn btn--sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} title="Ниже">
                  ↓
                </button>
                <button className="btn btn--sm btn--danger" onClick={() => setItems(items.filter((_, k) => k !== i))} title="Удалить">
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button className="ed__list-add" onClick={() => setItems([...items, { title: "" }])}>
          <Icon name="plus" size={15} /> {tab === "basis" ? "Добавить норму" : "Добавить пояснение"}
        </button>
      </div>
    </section>
  );
}
