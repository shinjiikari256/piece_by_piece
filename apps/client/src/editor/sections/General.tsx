import { formatDate } from "../../util/format";
import type { CaseFile } from "../../../../../shared/case";
import { editor, useEditor } from "../state";
import { ObjectFields } from "../SchemaForm";
import { SCHEMA } from "../shared";

export function GeneralSection() {
  const draft = useEditor((s) => s.draft);
  return (
    <section className="ed__panel ed__panel--narrow">
      <h2>Основное</h2>
      <p className="muted">
        id дела должен быть уникальным: под ним дело появится в игре. Когда дело готово, включите показ в списке в разделе «Видимость».
        {draft.updatedAt && ` Последнее изменение: ${formatDate(draft.updatedAt, true)}.`}
      </p>
      <ObjectFields
        schema={SCHEMA}
        value={draft}
        ctx={{ draft }}
        only={["id", "number", "title", "tagline", "introduction", "difficulty"]}
        onChange={(v) => editor.update(() => v as CaseFile, "general")}
      />
    </section>
  );
}
