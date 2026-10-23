import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL, STATUS_LABEL, type ServerEvent } from "../../../../shared/api";
import type { CaseSummary } from "../content/repository";
import { formatDate } from "../util/format";
import { useAccount, isStaff } from "../state/account";
import { account, api, pendingJoinToken } from "../state/api";
import { AuthPage, Field, PasswordForm } from "./account";
import { AdminPage, StatusChip } from "./admin";
import { OfflinePage } from "./offline-page";
import { useDismiss, useMenuKeys } from "./hooks";
import { initials, shortName } from "../util/names";
import { Link, navigate, type Route } from "./router";
import { SiteLinkItems, useSiteLinks } from "./site-nav";
import { openCase } from "./screens";
import { useProfile } from "../state/platform-hooks";

/**
 * Всё, что работает с сервером: вход и учётная запись, личный кабинет, админка, мероприятия, выгрузка офлайн-версии.
 * Модуль грузится лениво и только в онлайн-сборке (`site.tsx`, `App.tsx`, конструктор): в офлайн-файл не попадает.
 */

export { ForcePasswordChange } from "./account";

/** Страницы учётной записи, админки и выгрузки офлайн-версии. */
export function OnlinePage({ route }: { route: Route }) {
  if (route.page === "login" || route.page === "register" || route.page === "guest") return <AuthPage tab={route.page} />;
  if (route.page === "account") return <AccountPage />;
  if (route.page === "admin") return <AdminPage route={route} />;
  if (route.page === "offline") return <OfflinePage />;
  return null;
}

/** Вход или меню пользователя в шапке. */
export function OnlineHeader({ route }: { route: Route }) {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  // открыли по ссылке регистрации — сразу форма
  useEffect(() => {
    if (pendingJoinToken() && route.page !== "register") navigate("/register");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {server === "online" && me && <UserMenu route={route} />}
      {server !== "unknown" && !me && <SignedOut />}
    </>
  );
}

/** Мероприятия группы студента: дела, которые можно сдать зачётно. */
export function OnlineEvents({ cases }: { cases: CaseSummary[] | null }) {
  const me = useAccount((s) => s.me);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  useEffect(() => {
    if (me?.role !== "student") return setEvents([]);
    api<ServerEvent[]>("GET", "/events").then(setEvents, () => setEvents([]));
  }, [me]);
  const shown = events.filter((e) => e.open);
  if (!shown.length) return null;
  return (
    <section className="stack">
      <h2>Мероприятия</h2>
      {shown.map((e) => (
        <div key={e.id} className="card stack">
          <b>{e.title}</b>
          {e.closesAt && <span className="muted small">до {formatDate(e.closesAt, true)}</span>}
          <ul className="list-reset stack">
            {e.caseIds.map((id) => {
              const done = e.doneByCase?.[id] ?? 0;
              const left = e.maxScoredAttempts == null ? null : Math.max(0, e.maxScoredAttempts - done);
              return (
                <li key={id} className="row">
                  <button className="btn btn--sm btn--primary" disabled={left === 0} onClick={() => void openCase(id, e.id).catch(() => undefined)}>
                    {cases?.find((c) => c.id === id)?.title ?? id}
                  </button>
                  <span className="muted small">{left === null ? `сдано: ${done}` : `осталось попыток: ${left}`}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Меню пользователя в шапке (вошедший). */
function UserMenu({ route }: { route: Route }) {
  const me = useAccount((s) => s.me)!;
  const links = useSiteLinks(route);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [ref]);
  useMenuKeys(open, ref);
  const item = (path: string, label: string) => (
    <Link to={path} role="menuitem" onClick={() => setOpen(false)}>
      {label}
    </Link>
  );
  return (
    <div className="user-menu" ref={ref}>
      <button className="user-menu__button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="avatar">{initials(me.fullName)}</span>
        <span className="user-menu__name">{shortName(me.fullName)}</span>
        <span className="user-menu__caret">▾</span>
      </button>
      {open && (
        <div className="user-menu__popup" role="menu">
          <div className="user-menu__who">
            <b>{me.fullName}</b>
            <span className="muted">
              {me.login} · {ROLE_LABEL[me.role]}
            </span>
          </div>
          {/* на телефоне разделы сайта — здесь, в шапке их нет */}
          <div className="user-menu__nav">
            <SiteLinkItems links={links} onPick={() => setOpen(false)} />
            <hr />
          </div>
          {item("/account", "Личный кабинет")}
          {isStaff(me) && item("/admin/groups", me.role === "admin" ? "Группы" : "Мои группы")}
          {isStaff(me) && item("/admin/events", "Мероприятия")}
          {isStaff(me) && item("/offline", "Скачать офлайн-версию")}
          {me.role === "admin" && item("/admin/settings", "Настройки")}
          <hr />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void account.logout().then(() => navigate("/"));
            }}
          >
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}

/** Без входа: имя гостя (если указал) и «Вход». */
function SignedOut() {
  const guest = useProfile().name.trim();
  return (
    <>
      {guest && (
        <Link className="site-guest" to="/guest" title="Вы играете как гость — изменить ФИО">
          {shortName(guest)} <span>гость</span>
        </Link>
      )}
      <Link className="btn btn--primary btn--sm site-login" to="/login">
        Вход
      </Link>
    </>
  );
}

/** Личный кабинет вошедшего (или гостевой вход, если сервер без учётных записей). */
function AccountPage() {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  useEffect(() => {
    if (server === "online" && !me) navigate("/login");
  }, [server, me]);
  if (server === "unknown") return null;
  // без сервера учётных записей нет: вход преподавателя и гость
  if (server === "none") return <AuthPage tab="guest" />;
  if (!me) return null;
  return (
    <div className="page page--narrow">
      <header className="page__head">
        <h1>Личный кабинет</h1>
      </header>
      <section className="card">
        <div className="profile-head">
          <span className="avatar avatar--big">{initials(me.fullName)}</span>
          <StatusChip status={me.status} />
        </div>
        <div className="form">
          <Field label="ФИО">
            <input className="input" value={me.fullName} readOnly />
          </Field>
          <div className="pair">
            <Field label="Логин">
              <input className="input mono" value={me.login} readOnly />
            </Field>
            <Field label="Роль">
              <input className="input" value={ROLE_LABEL[me.role]} disabled />
            </Field>
          </div>
          <div className="pair">
            <Field label="Группа">
              <input className="input" value={me.group?.name ?? "не назначена"} disabled />
            </Field>
            <Field label="Статус">
              <input className="input" value={STATUS_LABEL[me.status]} disabled />
            </Field>
          </div>
        </div>
        <p className="muted small">
          {me.status === "pending" ? `Преподаватель подтвердит вашу учётную запись${me.group ? "" : " и добавит в группу"}. Проходить дела можно уже сейчас. ` : ""}
          Изменить ФИО, группу или роль может преподаватель.
        </p>
      </section>
      <section className="card">
        <h2>Смена пароля</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
