import { useState } from "react";
import { Tabs } from "../Tabs";
import { CaseFile } from "../../../../../shared/case";
import { editor, useEditor } from "../state";
import { ObjectFields } from "../SchemaForm";
import { SCHEMA } from "../EditorApp";

const SOLUTION_TABS = [
  { id: "verdict", label: "Вердикт", hint: "Правильный ответ: какое право, нарушено ли, кто виноват.", keys: ["right", "rightText", "violation", "responsibleCharacter", "correctAnswer"] },
  { id: "story", label: "Что произошло", hint: "Рассказ для разбора после ответа игрока: что произошло и кто в чём солгал. Поддерживается **жирный** и *курсив*.", keys: ["whatHappened", "explanation"] },
  { id: "law", label: "Квалификация", hint: "Правовая оценка и виды ответственности: применима ли каждая.", keys: ["legalQualification", "qualificationNotes"] },
  { id: "evidence", label: "Ключевые улики", hint: "Что доказывает вывод — показывается в разборе.", keys: ["keyEvidence"] },
  { id: "sources", label: "Источники", hint: "Нормы и литература: статьи нормативных актов.", keys: ["sources"] },
] as const;

export function SolutionSection() {
  const draft = useEditor((s) => s.draft);
  const [tab, setTab] = useState<(typeof SOLUTION_TABS)[number]["id"]>("verdict");
  const current = SOLUTION_TABS.find((t) => t.id === tab)!;
  return (
    <section className="conf-panel">
      <Tabs variant="bar" tabs={SOLUTION_TABS} active={tab} onChange={setTab} />
      <div className="ed__panel ed__panel--narrow">
        <p className="muted">{current.hint}</p>
        <ObjectFields
          schema={SCHEMA.properties.solution}
          value={draft.solution}
          ctx={{ draft }}
          only={[...current.keys]}
          onChange={(v) => editor.update((d) => ({ ...d, solution: v as CaseFile["solution"] }), `solution:${tab}`)}
        />
      </div>
    </section>
  );
}
