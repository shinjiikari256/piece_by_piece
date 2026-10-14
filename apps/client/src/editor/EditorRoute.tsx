import "./styles/shell.css";
import "./styles/forms.css";
import "./styles/map.css";
import "./styles/dialogue-graph.css";
import "./styles/pickers-and-looks.css";
import "./styles/toolbar.css";
import "./styles/tabs.css";
import "./styles/home.css";
import "./styles/lists.css";
import "./styles/conditions-effects.css";
import "./styles/law.css";
import "./styles/flags.css";
import { AdminGate } from "./AdminGate";
import { EditorApp } from "./EditorApp";

/** Раздел сайта «Конструктор дел» (#/editor): грузится отдельным куском, только когда его открывают. */
export default function EditorRoute() {
  return (
    <div className="editor-route">
      <AdminGate>
        <EditorApp />
      </AdminGate>
    </div>
  );
}
