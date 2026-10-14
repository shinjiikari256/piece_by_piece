import "./styles/index.css";
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
