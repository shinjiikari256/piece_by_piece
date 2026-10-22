import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROLE_LABEL,
  ROLE_OPTIONS,
  STATUS_LABEL,
  type AdminGroup,
  type AdminUser,
  type Role,
  type UserStatus,
  type UsersPatch,
} from "../../../../../shared/api";
import { useAccount } from "../../state/account";
import { api } from "../../state/api";
import { Select } from "../Select";
import { ask } from "../dialog";
import { Link, navigate, setSearchParams, useSearchParam } from "../router";
import { useArrowNav } from "../hooks";
import { ROW, rowKeys } from "../table-rows";
import { StatusChip, date, fail } from "./index";

// ---------- Пользователи ----------

export function UsersSection({ groups, isAdmin, onChanged }: { groups: AdminGroup[]; isAdmin: boolean; onChanged: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [status, setStatus] = useState("");
  // фильтр по группе живёт в адресе: на него ведут ссылки из групп
  const group = useSearchParam("group") ?? "";
  const setGroup = (v: string) => setSearchParams({ group: v });
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const meId = useAccount((s) => s.me?.id);
  const table = useRef<HTMLTableElement>(null);
  useArrowNav(table, ROW, { within: true });

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (group) params.set("group", group);
    if (q.trim()) params.set("q", q.trim());
    return api<AdminUser[]>("GET", `/admin/users?${params}`).then((list) => {
      setUsers(list);
      setSelected((s) => new Set([...s].filter((id) => list.some((u) => u.id === id))));
    }, fail);
  }, [status, group, q]);
  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const patch = async (set: UsersPatch["set"], confirm?: string) => {
    if (confirm && !(await ask({ title: confirm, confirmLabel: "Да" }))) return;
    try {
      await api("PATCH", "/admin/users", { ids: [...selected], set });
      await load();
      onChanged();
    } catch (e) {
      fail(e);
    }
  };

  const all = users ?? [];
  const selectable = all.filter((u) => u.id !== meId);
  const allChecked = selectable.length > 0 && selectable.every((u) => selected.has(u.id));
  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pending = all.filter((u) => u.status === "pending").length;

  return (
    <section>
      <header className="page__head">
        <h1>Пользователи</h1>
        <span className="muted">
          {users ? `${users.length} чел.` : "Загрузка…"}
          {pending > 0 && ` · ждут подтверждения: ${pending}`}
        </span>
      </header>
      <div className="toolbar">
        <input className="input toolbar__search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по ФИО или логину" />
        <Select
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "Все статусы" },
            ...(["pending", "active", "blocked"] as UserStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
          ]}
        />
        <Select
          value={group}
          onChange={setGroup}
          options={[{ value: "", label: "Все группы" }, { value: "none", label: "Без группы" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]}
        />
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <b>Выбрано: {selected.size}</b>
          <button className="btn btn--primary btn--sm" onClick={() => void patch({ status: "active" })}>
            Подтвердить
          </button>
          <Select
            value=""
            placeholder="Перевести в группу…"
            onChange={(v) => void patch({ groupId: v === "none" ? null : Number(v) })}
            options={[{ value: "none", label: "Без группы" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]}
          />
          {isAdmin && (
            <Select
              value=""
              placeholder="Назначить роль…"
              onChange={(v) => void patch({ role: v as Role }, `Назначить роль «${ROLE_LABEL[v as Role]}» выбранным (${selected.size})?`)}
              options={ROLE_OPTIONS}
            />
          )}
          <button className="btn btn--sm" onClick={() => void patch({ status: "blocked" }, `Заблокировать выбранных (${selected.size})? Они не смогут войти.`)}>
            Заблокировать
          </button>
          <button className="linkbtn" onClick={() => setSelected(new Set())}>
            Снять выделение
          </button>
        </div>
      )}

      <div className="card card--flush">
        <table className="table table--cards" ref={table}>
          <thead>
            <tr>
              <th scope="col" className="check">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((u) => u.id)))}
                  aria-label="Выбрать всех"
                />
              </th>
              <th scope="col">ФИО</th>
              <th scope="col">Логин</th>
              <th scope="col">Группа</th>
              <th scope="col">Роль</th>
              <th scope="col">Статус</th>
              <th scope="col">Регистрация</th>
            </tr>
          </thead>
          <tbody>
            {all.map((u, i) => (
              <tr
                key={u.id}
                className="is-link"
                data-selected={selected.has(u.id) || undefined}
                onClick={() => navigate(`/admin/users/${u.id}`)}
                // Enter — открыть пользователя, пробел — отметить (кроме себя)
                {...rowKeys(i === 0, () => navigate(`/admin/users/${u.id}`), () => u.id !== meId && toggle(u.id))}
              >
                <td className="check" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(u.id)} disabled={u.id === meId} onChange={() => toggle(u.id)} aria-label={`Выбрать ${u.fullName}`} />
                </td>
                <td>
                  <b>{u.fullName}</b>
                </td>
                <td className="mono" data-label="Логин">{u.login}</td>
                <td data-label="Группа">
                  {u.group ? (
                    <Link to={`/admin/groups?group=${u.group.id}`} onClick={(e) => e.stopPropagation()}>
                      {u.group.name}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td data-label="Роль">{ROLE_LABEL[u.role]}</td>
                <td data-label="Статус">
                  <StatusChip status={u.status} />
                  {u.viaLink && u.status === "pending" && <span className="muted small"> по ссылке</span>}
                </td>
                <td data-label="Регистрация">{date(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users?.length === 0 && <p className="muted empty">Никого не нашлось.</p>}
      </div>
    </section>
  );
}
