import { useCallback, useEffect, useState } from "react";
import {
  ROLE_LABEL,
  ROLE_OPTIONS,
  STATUS_LABEL,
  type AdminGroup,
  type AdminUser,
  type Role,
  type UserDetail,
  type UserStatus,
  type UsersPatch,
} from "../../../../../shared/api";
import { ApiFailure, api, useAccount } from "../../state/account";
import { Select } from "../Select";
import { Alert } from "../alert";
import { Dialog } from "../window";
import { initials } from "../../util/names";
import { formatDate } from "../../util/format";
import { Icon } from "../icons";
import { ask } from "../dialog";
import { navigate } from "../router";
import { Field } from "../account";
import { ResultsTable, fromServer } from "../results";
import { openResult } from "../screens";
import { StatusChip, date, fail } from "./index";

// ---------- Пользователи ----------

export function UsersSection({ groups, isAdmin, onChanged }: { groups: AdminGroup[]; isAdmin: boolean; onChanged: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [status, setStatus] = useState("");
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const meId = useAccount((s) => s.me?.id);

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
        <table className="table">
          <thead>
            <tr>
              <th className="check">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((u) => u.id)))}
                  aria-label="Выбрать всех"
                />
              </th>
              <th>ФИО</th>
              <th>Логин</th>
              <th>Группа</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Регистрация</th>
            </tr>
          </thead>
          <tbody>
            {all.map((u) => (
              <tr key={u.id} className="is-link" data-selected={selected.has(u.id) || undefined} onClick={() => navigate(`#/admin/users/${u.id}`)}>
                <td className="check" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(u.id)} disabled={u.id === meId} onChange={() => toggle(u.id)} aria-label={`Выбрать ${u.fullName}`} />
                </td>
                <td>
                  <b>{u.fullName}</b>
                </td>
                <td className="mono">{u.login}</td>
                <td>{u.group?.name ?? <span className="muted">—</span>}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>
                  <StatusChip status={u.status} />
                  {u.viaLink && u.status === "pending" && <span className="muted small"> по ссылке</span>}
                </td>
                <td>{date(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users?.length === 0 && <p className="muted empty">Никого не нашлось.</p>}
      </div>
    </section>
  );
}

// ---------- Карточка пользователя ----------

/** Как личный кабинет, но с правкой: ФИО, группа, роль (админ) + подтвердить/заблокировать/сбросить пароль/удалить. */
export function UserPage({ id, groups, isAdmin }: { id: number; groups: AdminGroup[]; isAdmin: boolean }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState("");
  const [reset, setReset] = useState(false);
  const [name, setName] = useState("");
  const meId = useAccount((s) => s.me?.id);
  const load = useCallback(
    () =>
      api<UserDetail>("GET", `/admin/users/${id}`).then(
        (d) => {
          setDetail(d);
          setName(d.user.fullName);
        },
        (e) => setError(e instanceof ApiFailure ? e.message : "Ошибка связи с сервером"),
      ),
    [id],
  );
  useEffect(() => void load(), [load]);

  if (error)
    return (
      <section>
        <BackHead />
        <p className="muted">{error}</p>
      </section>
    );
  if (!detail) return null;
  const { user: u, results, stats } = detail;
  const self = u.id === meId;
  const patch = async (set: UsersPatch["set"]) => {
    try {
      await api("PATCH", "/admin/users", { ids: [u.id], set });
      await load();
    } catch (e) {
      fail(e);
    }
  };
  const saveName = async () => {
    if (!name.trim() || name.trim() === u.fullName) return setName(u.fullName);
    try {
      await api("PATCH", `/admin/users/${u.id}`, { fullName: name.trim() });
      await load();
    } catch (e) {
      fail(e);
      setName(u.fullName);
    }
  };
  const remove = async () => {
    const ok = await ask({
      title: `Удалить ${u.fullName}?`,
      text: `Учётная запись и все прохождения (${stats.attempts}) будут удалены без возможности восстановления.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("DELETE", `/admin/users/${u.id}`);
      navigate("#/admin/users");
    } catch (e) {
      fail(e);
    }
  };
  const fmt = (v: number | null, unit = "") => (v == null ? "—" : `${v}${unit}`);

  return (
    <section className="user-page">
      <BackHead />

      <section className="card">
        <div className="profile-head">
          <span className="avatar avatar--big">{initials(u.fullName)}</span>
          <StatusChip status={u.status} />
        </div>
        <div className="form">
          <Field label="ФИО">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </Field>
          <div className="pair">
            <Field label="Логин">
              <input className="input mono" value={u.login} readOnly />
            </Field>
            <Field label="Роль">
              {isAdmin && !self ? (
                <Select value={u.role} onChange={(v) => void patch({ role: v as Role })} options={ROLE_OPTIONS} />
              ) : (
                <input className="input" value={ROLE_LABEL[u.role]} disabled />
              )}
            </Field>
          </div>
          <div className="pair">
            <Field label="Группа">
              <Select
                value={u.group ? String(u.group.id) : "none"}
                onChange={(v) => void patch({ groupId: v === "none" ? null : Number(v) })}
                options={[{ value: "none", label: "Без группы" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]}
              />
            </Field>
            <Field label="Дата регистрации">
              <input className="input" value={`${formatDate(u.createdAt)}${u.viaLink ? " · по ссылке группы" : ""}`} disabled />
            </Field>
          </div>
        </div>
        {!self && (
          <div className="user-actions">
            {u.status !== "active" && (
              <button className="btn btn--primary" onClick={() => void patch({ status: "active" })}>
                {u.status === "blocked" ? "Разблокировать" : "Подтвердить"}
              </button>
            )}
            {u.status !== "blocked" && (
              <button
                className="btn"
                onClick={() =>
                  void ask({ title: `Заблокировать ${u.fullName}?`, text: "Пользователь не сможет войти, открытые сессии завершатся.", confirmLabel: "Заблокировать", danger: true }).then(
                    (ok) => void (ok && patch({ status: "blocked" })),
                  )
                }
              >
                Заблокировать
              </button>
            )}
            <button className="btn" onClick={() => setReset(true)}>
              Сбросить пароль
            </button>
            <button className="btn btn--danger" onClick={() => void remove()}>
              Удалить
            </button>
          </div>
        )}
      </section>

      {results.length === 0 ? (
        <p className="muted user-page__empty">Прохождений пока нет.</p>
      ) : (
        <>
          <h2>Статистика</h2>
          <div className="stats">
            <Stat label="Прохождений" value={String(stats.attempts)} />
            <Stat label="Разных дел" value={String(stats.cases)} />
            <Stat label="Средний результат" value={fmt(stats.avgPercent, "%")} />
            <Stat label="Лучший результат" value={fmt(stats.bestPercent, "%")} />
            <Stat label="Подсказок в среднем" value={fmt(stats.avgHints)} />
            <Stat label="Ошибок сопоставлений" value={fmt(stats.avgWrongDeductions)} hint="в среднем за прохождение" />
            <Stat label="Время в среднем" value={stats.avgMinutes == null ? "—" : stats.avgMinutes < 1 ? "< 1 мин" : `${Math.round(stats.avgMinutes)} мин`} />
            <Stat label="Последнее прохождение" value={stats.lastAt ? date(stats.lastAt) : "—"} />
          </div>
          <h2>Прохождения</h2>
          <div className="card card--flush">
            <ResultsTable rows={results.map((r) => fromServer(r, { id: u.id, fullName: u.fullName, group: u.group?.name }))} onOpen={(r) => void openResult(r.caseId, r.record!)} />
          </div>
        </>
      )}
      {reset && <ResetPassword user={u} onClose={() => setReset(false)} />}
    </section>
  );
}

/** Шапка страницы пользователя: стрелка к списку и заголовок. */
function BackHead() {
  return (
    <header className="page__head page__head--back">
      <a className="btn btn--icon" href="#/admin/users" title="К списку пользователей" aria-label="К списку пользователей">
        <Icon name="back" />
      </a>
      <h1>Страница пользователя</h1>
    </header>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

function ResetPassword({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const run = async (password?: string) => {
    setError("");
    try {
      setResult((await api<{ password: string }>("POST", `/admin/users/${user.id}/reset-password`, { password })).password);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Ошибка связи с сервером");
    }
  };
  return (
    <Dialog
      title={`Сброс пароля: ${user.fullName}`}
      onClose={onClose}
      actions={
        result ? (
          <>
            <button className="btn" onClick={() => void navigator.clipboard?.writeText(result)}>
              Скопировать
            </button>
            <button className="btn btn--primary" onClick={onClose}>
              Готово
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onClose}>
              Отмена
            </button>
            <button className="btn btn--primary" onClick={() => void run(manual.trim() || undefined)}>
              {manual.trim() ? "Установить" : "Сгенерировать"}
            </button>
          </>
        )
      }
    >
      {result ? (
        <>
          <p>Временный пароль — передайте его человеку. При входе система попросит сменить его.</p>
          <p className="temp-password">{result}</p>
        </>
      ) : (
        <>
          <p className="muted">Текущий пароль перестанет действовать, открытые сессии завершатся.</p>
          <label className="field">
            <span className="field__label">Задать вручную (необязательно)</span>
            <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="от 8 символов" />
          </label>
          {error && <Alert>{error}</Alert>}
        </>
      )}
    </Dialog>
  );
}
