import { useCallback, useEffect, useState } from "react";
import { formatDate } from "../util/format";
import { validateCase } from "../content/validate";
import { editor } from "./state";
import { isStaff, useAccount } from "../state/account";
import { ApiFailure, api } from "../state/api";
import { ask, tell } from "../ui/kit/dialog";
import { confirmReplace, downloadJson } from "./actions";
import { filterCases, sortCases, type CaseSort } from "./case-sort";
import { CaseIconButton } from "./CaseIconButton";
import { VisibilityDialog } from "./VisibilityDialog";

interface RemoteCase {
  id: string;
  number: number;
  title: string;
  published: boolean;
  updatedAt?: string;
  createdAt?: string;
}

/** Дела конструктора, записанные на сервер: открыть, экспортировать, удалить, настроить видимость. Только онлайн-сборка. */
export function RemoteCases({ sort, query, reloadKey }: { sort: CaseSort; query: string; reloadKey: number }) {
  const online = useAccount((a) => a.server === "online" && isStaff(a.me));
  const [remote, setRemote] = useState<RemoteCase[]>([]);
  const [visibilityOf, setVisibilityOf] = useState<RemoteCase | null>(null);
  const reload = useCallback(() => api<RemoteCase[]>("GET", "/admin/cases").then(setRemote, () => setRemote([])), []);
  useEffect(() => {
    if (online) void reload();
  }, [online, reload, reloadKey]);

  /** Полное дело с сервера; при ошибке показывает окно и возвращает undefined. */
  const fetchCase = async (id: string) => {
    try {
      const { caseFile } = await api<{ caseFile: unknown }>("GET", `/admin/cases/${encodeURIComponent(id)}`);
      const checked = validateCase(caseFile);
      if (!checked.ok) return void tell({ title: "Дело на сервере не проходит проверку", text: checked.errors.slice(0, 8).join("\n") });
      return checked.caseFile;
    } catch (e) {
      void tell({ title: "Не удалось открыть", text: e instanceof ApiFailure ? e.message : "Нет связи с сервером." });
    }
  };
  const edit = async (id: string) => {
    const c = await fetchCase(id);
    if (c) editor.open(c);
  };
  const exportCase = async (id: string) => {
    const c = await fetchCase(id);
    if (c) downloadJson(c);
  };
  const remove = async (c: RemoteCase) => {
    const ok = await ask({
      title: `Удалить «${c.title}» с сервера?`,
      text: "Дело, его версии, попытки и привязки к мероприятиям будут удалены у всех. Результаты игроков останутся. Черновик в конструкторе не пострадает.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("DELETE", `/admin/cases/${encodeURIComponent(c.id)}`);
      await reload();
    } catch (e) {
      void tell({ title: "Не удалось удалить", text: e instanceof ApiFailure ? e.message : "Нет связи с сервером." });
    }
  };

  if (!remote.length) return null;
  const shown = sortCases(filterCases(remote, query), sort);
  return (
    <>
      <h2>Серверные дела</h2>
      <ul className="eh__list list-reset">
        {shown.map((c) => (
          <li key={c.id} className="eh__case">
            <span className="eh__num">№{c.number}</span>
            <span className="eh__info">
              <b>{c.title}</b>
              <span className="muted">
                {c.published ? "видно игрокам" : "скрыто"}
                {c.updatedAt && ` · ${formatDate(c.updatedAt)}`}
              </span>
            </span>
            <span className="eh__buttons">
              <CaseIconButton icon="eye" label="Видимость" onClick={() => setVisibilityOf(c)} />
              <CaseIconButton icon="pen" label="Редактировать" primary onClick={() => confirmReplace(() => void edit(c.id))} />
              <CaseIconButton icon="download" label="Экспорт в файл" onClick={() => void exportCase(c.id)} />
              <CaseIconButton icon="trash" label="Удалить с сервера" danger onClick={() => void remove(c)} />
            </span>
          </li>
        ))}
      </ul>
      {visibilityOf && <VisibilityDialog caseId={visibilityOf.id} number={visibilityOf.number} title={visibilityOf.title} published={visibilityOf.published} onClose={() => setVisibilityOf(null)} />}
    </>
  );
}
