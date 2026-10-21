import { useCallback, useEffect, useState } from "react";
import {
  ROLE_LABEL,
  ROLE_OPTIONS,
  type AdminGroup,
  type AdminUser,
  type Role,
  type UserDetail,
  type UsersPatch,
} from "../../../../../shared/api";
import { useAccount } from "../../state/account";
import { ApiFailure, api } from "../../state/api";
import { Select } from "../Select";
import { Alert } from "../alert";
import { Dialog } from "../window";
import { initials } from "../../util/names";
import { formatDate } from "../../util/format";
import { Icon } from "../icons";
import { ask } from "../dialog";
import { Link, navigate } from "../router";
import { Field } from "../account";
import { ResultsTable, fromServer } from "../results";
import { openResult } from "../screens";
import { StatusChip, date, fail } from "./index";
import { blurOnEnter } from "../../util/keys";

/** Как личный кабинет, но с правкой: ФИО, группа, роль (админ) + подтвердить/заблокировать/сбросить пароль/удалить. */
export function UserPage({ id, groups, isAdmin }: { id: number; groups: AdminGroup[]; isAdmin: boolean }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState("");
  const [reset, setReset] = useState(false);
  const [merge, setMerge] = useState(false);
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
      navigate("/admin/users");
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
              onKeyDown={blurOnEnter}
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
              <div className="row">
                <Select
                  value={u.group ? String(u.group.id) : "none"}
                  onChange={(v) => void patch({ groupId: v === "none" ? null : Number(v) })}
                  options={[{ value: "none", label: "Без группы" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]}
                />
                {u.group && (
                  <Link className="btn btn--icon" to={`/admin/groups?group=${u.group.id}`} title="Открыть группу" aria-label="Открыть группу">
                    <Icon name="link" />
                  </Link>
                )}
              </div>
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
            <button className="btn" onClick={() => setMerge(true)}>
              Объединить с…
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
      {merge && <MergeUser user={u} onClose={() => setMerge(false)} />}
    </section>
  );
}

/** Шапка страницы пользователя: стрелка к списку и заголовок. */
function BackHead() {
  return (
    <header className="page__head page__head--back">
      <Link className="btn btn--icon" to="/admin/users" title="К списку пользователей" aria-label="К списку пользователей">
        <Icon name="back" />
      </Link>
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

/** Объединение дублей: выбрать учётную запись, которая останется; прохождения этой переходят к ней. */
function MergeUser({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<AdminUser[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      void api<AdminUser[]>("GET", `/admin/users?${params}`).then((l) => setList(l.filter((x) => x.id !== user.id).slice(0, 8)), fail);
    }, 250);
    return () => clearTimeout(t);
  }, [q, user.id]);
  const run = async () => {
    const into = list.find((x) => x.id === target);
    if (!into) return;
    const ok = await ask({
      title: `Объединить с ${into.fullName}?`,
      text: `Прохождения ${user.fullName} перейдут к ${into.fullName}, а учётная запись ${user.fullName} будет удалена без возможности восстановления.`,
      confirmLabel: "Объединить",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("POST", `/admin/users/${user.id}/merge`, { intoId: into.id });
      navigate(`/admin/users/${into.id}`);
    } catch (e) {
      fail(e);
    }
  };
  return (
    <Dialog
      title={`Объединить дубль: ${user.fullName}`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" disabled={target == null} onClick={() => void run()}>
            Объединить
          </button>
        </>
      }
    >
      <p className="muted">Выберите запись, которая останется.</p>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по ФИО или логину" aria-label="Поиск пользователя" />
      <ul className="list-reset stack">
        {list.map((x) => (
          <li key={x.id}>
            <button className="btn btn--block" aria-pressed={target === x.id} onClick={() => setTarget(x.id)}>
              {x.fullName} · {x.login}
              {x.group ? ` · ${x.group.name}` : ""}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
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
