import { useEffect, useState } from "react";
import { actions, useGame } from "../../state/store";
import { Icon } from "../kit/icons";
import { TabbedModal } from "./common";

/** Блокнот: окно-папка по центру с заметками игрока. */
export function NotesWindow() {
  const open = useGame((s) => s.notesOpen);
  const notes = useGame((s) => s.playerNotes);
  if (!open) return null;
  return (
    <TabbedModal tabs={[{ id: "notes", label: "Заметки", icon: "notes" }]} onClose={() => actions.toggleNotes(false)} size="narrow" className="notes-window">
      <div className="notes-window__body col">
        <p className="muted notes-window__hint">Выделите текст в любом окне и нажмите «В заметки» — он допишется сюда.</p>
        <textarea className="notes-input notes-window__text" value={notes} autoFocus placeholder="Ваши предположения и вопросы…" onChange={(e) => actions.setNotes(e.target.value)} />
      </div>
    </TabbedModal>
  );
}

/**
 * Выделили текст в интерфейсе — рядом всплывает кнопка «В заметки».
 * Работает и мышью, и на сенсорном экране.
 */
export function SelectionToNotes() {
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const s = window.getSelection();
      const text = s?.toString().trim() ?? "";
      const node = s?.anchorNode instanceof Element ? s.anchorNode : s?.anchorNode?.parentElement;
      // в полях ввода и в самих заметках кнопка не нужна
      if (!text || text.length < 3 || node?.closest("textarea, input, .notes-window") || !s || s.rangeCount === 0) {
        setSel(null);
        return;
      }
      const rect = s.getRangeAt(0).getBoundingClientRect();
      setSel({ text, x: rect.left + rect.width / 2, y: rect.top });
    };
    const onUp = () => setTimeout(update, 0);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    document.addEventListener("keyup", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("keyup", onUp);
    };
  }, []);

  if (!sel) return null;
  return (
    <button
      className="to-notes"
      style={{ left: sel.x, top: Math.max(8, sel.y - 40) }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        actions.appendNote(sel.text);
        window.getSelection()?.removeAllRanges();
        setSel(null);
      }}
    >
      <Icon name="pen" size={15} /> В заметки
    </button>
  );
}
