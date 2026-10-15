import { editor, useEditor } from "../state";
import { Alert } from "../../ui/alert";
import { locateError } from "../errors";

export function ErrorsSection() {
  const draft = useEditor((s) => s.draft);
  const errors = useEditor((s) => s.errors);
  const located = errors.map((e) => locateError(e, draft));
  if (!errors.length) {
    return (
      <section className="ed__panel">
        <h2>Ошибок нет</h2>
        <p className="muted">Дело можно сохранить и проверить в игре.</p>
      </section>
    );
  }
  return (
    <section className="ed__panel ed__panel--narrow">
      <h2>Ошибки ({errors.length})</h2>
      <p className="muted">Пока есть ошибки, дело нельзя сохранить и запустить в игре. Нажмите на карточку — откроется место ошибки.</p>
      <ul className="err-list">
        {located.map((e, i) => (
          <li key={i}>
            <Alert
              icon
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
        ))}
      </ul>
    </section>
  );
}
