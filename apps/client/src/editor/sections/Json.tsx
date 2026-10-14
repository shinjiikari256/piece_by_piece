import { useEffect, useMemo, useState } from "react";
import { parseCase } from "../../../../../shared/migrate";
import { editor, editorStore, useEditor } from "../state";
import { Alert } from "../../ui/alert";

export function JsonSection() {
  const draft = useEditor((s) => s.draft);
  const initial = useMemo(() => JSON.stringify(draft, null, 2), [draft]);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(initial), [initial]);

  const apply = () => {
    try {
      const parsed = parseCase(JSON.parse(text));
      if (!parsed.success) {
        setError(parsed.errors.slice(0, 10).join("\n"));
        return;
      }
      setError(null);
      editor.update(() => parsed.data);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <section className="ed__panel ed__json">
      <div className="ed__json-bar">
        <h2>JSON дела</h2>
        <button className="btn btn--primary" disabled={text === initial} onClick={apply}>
          Применить
        </button>
        <button className="btn" disabled={text === initial} onClick={() => setText(initial)}>
          Сбросить правки
        </button>
      </div>
      {error && <Alert as="pre">{error}</Alert>}
      <textarea spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
    </section>
  );
}

// для отладки в консоли
if (import.meta.env.MODE === "development") Object.assign(window, { __editor: { editor, editorStore } });
