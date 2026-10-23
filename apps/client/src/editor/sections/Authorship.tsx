import type { CaseFile } from "../../../../../shared/case";
import { editor, useEditor } from "../state";
import { ObjectFields } from "../SchemaForm";
import { SCHEMA } from "../shared";

export function AuthorshipSection() {
  const draft = useEditor((s) => s.draft);
  return (
    <section className="ed__panel ed__panel--narrow">
      <h2>Авторство</h2>
      <p className="muted">Игроки видят автора, лицензию и почту (если указана): других способов связаться с автором в игре нет.</p>
      <ObjectFields schema={SCHEMA.properties.meta} value={draft.meta ?? {}} ctx={{ draft }} onChange={(m) => editor.update(() => ({ ...draft, meta: m as CaseFile["meta"] }), "authorship")} />
    </section>
  );
}
