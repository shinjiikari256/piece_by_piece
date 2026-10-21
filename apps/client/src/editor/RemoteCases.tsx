import { useEffect, useState } from "react";
import { formatDate } from "../util/format";
import { validateCase } from "../content/validate";
import { editor } from "./state";
import { isStaff, useAccount } from "../state/account";
import { ApiFailure, api } from "../state/api";
import { tell } from "../ui/dialog";
import { confirmReplace } from "./actions";

/** Дела конструктора, записанные на сервер: список и открытие на редактирование. Только онлайн-сборка. */
export function RemoteCases() {
  const online = useAccount((a) => a.server === "online" && isStaff(a.me));
  const [remote, setRemote] = useState<{ id: string; number: number; title: string; published: boolean; updatedAt?: string }[]>([]);
  useEffect(() => {
    if (online) void api<typeof remote>("GET", "/admin/cases").then(setRemote, () => setRemote([]));
  }, [online]);
  const openRemote = async (id: string) => {
    try {
      const { caseFile } = await api<{ caseFile: unknown }>("GET", `/admin/cases/${encodeURIComponent(id)}`);
      const checked = validateCase(caseFile);
      if (!checked.ok) return void tell({ title: "Дело на сервере не проходит проверку", text: checked.errors.slice(0, 8).join("\n") });
      editor.open(checked.caseFile);
    } catch (e) {
      void tell({ title: "Не удалось открыть", text: e instanceof ApiFailure ? e.message : "Нет связи с сервером." });
    }
  };
  if (!remote.length) return null;
  return (
    <>
      <h2>Дела на сервере</h2>
      <ul className="eh__list list-reset">
        {remote.map((c) => (
          <li key={c.id} className="eh__case">
            <span className="eh__num">№{c.number}</span>
            <span className="eh__info">
              <b>{c.title}</b>
              <span className="muted">
                {c.published ? "видно игрокам" : "скрыто"}
                {c.updatedAt && ` · ${formatDate(c.updatedAt)}`}
              </span>
            </span>
            <button className="btn btn--primary" onClick={() => confirmReplace(() => void openRemote(c.id))}>
              Открыть
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
