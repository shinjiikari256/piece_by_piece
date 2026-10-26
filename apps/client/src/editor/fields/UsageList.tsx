import { editor } from "../state";
import { Icon } from "../../ui/kit/icons";
import type { FlagUse } from "./variables";

/** «Где используется (N)»: список мест с переходом по клику. */
export function UsageList({ uses }: { uses: FlagUse[] }) {
  return (
    <div className="ef">
      <span className="ef__label">Где используется ({uses.length})</span>
      {uses.length ? (
        <ul className="flag-uses">
          {uses.map((u, i) => (
            <li key={i}>
              <button className="flag-use" onClick={() => editor.goto(u.focus.section, u.focus)} title="Перейти">
                <span className="flag-use__kind" data-tone={u.kind === "ставит" || u.kind === "выдаёт" || u.kind === "запускает" ? "good" : undefined}>
                  {u.kind}
                </span>
                <span className="flag-use__where">{u.where}</span>
                <Icon name="back" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Нигде не используется.</p>
      )}
    </div>
  );
}
