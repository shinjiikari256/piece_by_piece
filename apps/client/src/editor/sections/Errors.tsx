import { editor, useEditor } from "../state";
import { Alert } from "../../ui/alert";
import { locateError } from "../errors";

export function ErrorsSection() {
  const draft = useEditor((s) => s.draft);
  const errors = useEditor((s) => s.errors);
  const warnings = useEditor((s) => s.warnings);
  if (!errors.length && !warnings.length) {
    return (
      <section className="ed__panel">
        <h2>Ошибок нет</h2>
        <p className="muted">Дело можно сохранить и проверить в игре.</p>
      </section>
    );
  }
  const list = (messages: string[], tone: "bad" | "warn") => (
    <ul className="err-list">
      {messages.map((message, i) => {
        const e = locateError(message, draft);
        return (
          <li key={i}>
            <Alert
              icon
              tone={tone}
              className="err-card"
              title={
                <>
                  {e.where}
                  {e.focus.id && <code>{e.focus.id}</code>}
                </>
              }
              onClick={() => editor.goto(e.focus.section, e.focus)}
            >
              {e.message}
            </Alert>
          </li>
        );
      })}
    </ul>
  );
  return (
    <section className="ed__panel ed__panel--narrow">
      {errors.length > 0 && (
        <>
          <h2>Ошибки ({errors.length})</h2>
          <p className="muted">Пока есть ошибки, дело нельзя сохранить и запустить в игре. Нажмите на карточку — откроется место ошибки.</p>
          {list(errors, "bad")}
        </>
      )}
      {warnings.length > 0 && (
        <>
          <h2>Предупреждения ({warnings.length})</h2>
          <p className="muted">Дело запустится, но здесь, скорее всего, что-то недоделано.</p>
          {list(warnings, "warn")}
        </>
      )}
    </section>
  );
}
