import type { CaseFile, Condition, NpcDialogue } from "../../../../../shared/case";
import { Select } from "../../ui/kit/Select";
import { moveItem } from "../../util/lists";
import { ConditionEditor } from "../fields/Conditions";

/**
 * Диалоги человека на карте по условию (например, очная ставка: «другой персонаж идёт за игроком»).
 * Запускается первый подходящий по порядку; если ни один не подошёл — основной диалог человека.
 */
export function NpcDialogues({ dialogues, draft, onChange }: { dialogues: NpcDialogue[]; draft: CaseFile; onChange: (v: NpcDialogue[]) => void }) {
  const options = draft.dialogues.map((d) => ({ value: d.id, label: `${draft.characters.find((c) => c.id === d.characterId)?.name ?? d.characterId} · ${d.id}` }));
  const set = (i: number, d: NpcDialogue) => onChange(dialogues.map((x, k) => (k === i ? d : x)));
  return (
    <section className="zact stack">
      <h4 title="Запускается первый подходящий по порядку; иначе — основной диалог">Диалоги по условию</h4>
      {dialogues.length === 0 && <p className="muted">Только основной диалог</p>}
      {dialogues.map((nd, i) => (
        <div key={i} className="zact__item stack">
          <div className="row">
            <b>{i + 1}.</b>
            <span className="zact__tools">
              <button className="btn btn--sm btn--icon" disabled={i === 0} onClick={() => onChange(moveItem(dialogues, i, -1) ?? dialogues)} title="Выше (подойдёт раньше)" aria-label="Выше">
                ↑
              </button>
              <button className="btn btn--sm btn--icon" disabled={i === dialogues.length - 1} onClick={() => onChange(moveItem(dialogues, i, 1) ?? dialogues)} title="Ниже" aria-label="Ниже">
                ↓
              </button>
              <button className="btn btn--sm btn--icon" onClick={() => onChange(dialogues.filter((_, k) => k !== i))} title="Убрать" aria-label="Убрать диалог">
                ✕
              </button>
            </span>
          </div>
          <Select value={nd.dialogueId} placeholder="какой диалог" options={options} onChange={(v) => set(i, { ...nd, dialogueId: v })} />
          <ConditionEditor
            value={(nd.requires ?? {}) as Condition}
            ctx={{ draft }}
            label={<span className="ef__label">Условие</span>}
            onChange={(v) => {
              const { requires: _r, ...rest } = nd;
              set(i, Object.keys(v as object).length ? { ...rest, requires: v as Condition } : rest);
            }}
          />
        </div>
      ))}
      <Select className="sel--add" value="" placeholder="+ диалог по условию" options={options} onChange={(v) => onChange([...dialogues, { dialogueId: v }])} />
    </section>
  );
}
