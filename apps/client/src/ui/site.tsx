import { Suspense, lazy, useEffect, useRef, useState, Fragment } from "react";
import { ROLE_LABEL, STATUS_LABEL, type ServerEvent } from "../../../../shared/api";
import type { CaseSummary } from "../content/repository";
import { formatDate } from "../util/format";
import { APP_NAME, DEV_EDITOR, OFFLINE } from "../env";
import { account, api, isStaff, pendingJoinToken, useAccount } from "../state/account";
import { useProfile } from "../state/platform-hooks";
import { AuthPage, PasswordForm } from "./account";
import { Field } from "./account";
import { AdminPage, StatusChip } from "./admin";
import { Loader } from "./loader";
import { useDismiss, useMenuKeys } from "./hooks";
import { DEFAULT_THEME_LABEL, THEMES, THEME_LABELS, setTheme, useTheme, type ThemeName } from "./theme";
import { initials, shortName } from "../util/names";
import { Icon } from "./icons";
import { Logo, LogoArt } from "./logo";
import { Link, navigate, useRoute, type Route } from "./router";
import { CaseList, HowToContent, HowToWindow, openCase, useCaseList } from "./screens";
import { ResultsPage } from "./results-page";

/** Конструктор — отдельным куском по требованию; в офлайн-файле его нет вовсе. */
const EditorRoute = OFFLINE ? null : lazy(() => import("../editor/EditorRoute"));


/** Сайт вокруг игры: шапка и обычные страницы. Папки — только у дел. */
export function Site() {
  const route = useRoute();
  // открыли по ссылке регистрации — сразу форма
  useEffect(() => {
    if (pendingJoinToken() && route.page !== "register") navigate("/register");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="site">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
        К содержимому
      </a>
      <SiteHeader route={route} />
      <main id="main" tabIndex={-1} className={`site__main ${route.page === "editor" ? "site__main--editor" : ""}`}>
        {route.page === "home" && <Landing />}
        {(route.page === "cases" || route.page === "play") && <CasesPage />}
        {route.page === "howto" && (
          <div className="page page--narrow">
            <HowToContent />
          </div>
        )}
        {route.page === "results" && <ResultsPage />}
        {(route.page === "login" || route.page === "register" || route.page === "guest") && <AuthPage tab={route.page} />}
        {route.page === "account" && <AccountPage />}
        {route.page === "admin" && <AdminPage route={route} />}
        {route.page === "editor" && EditorRoute && (
          <Suspense fallback={<Loader label="Загружаем конструктор…" />}>
            <EditorRoute />
          </Suspense>
        )}
      </main>
    </div>
  );
}

// ---------- Шапка ----------

function SiteHeader({ route }: { route: Route }) {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  const staff = server === "online" && isStaff(me);
  const link = (path: string, label: string, active: boolean) => (
    <Link to={path} className="site-nav__link" aria-current={active ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="logo" to="/">
          <Logo />
          {APP_NAME}
        </Link>
        <nav className="site-nav" aria-label="Разделы сайта">
          {link("/cases", "Дела", route.page === "cases")}
          {link("/results", "Результаты", route.page === "results")}
          {staff && link("/admin/users", "Пользователи", route.page === "admin" && route.section === "users")}
          {(staff || (server === "none" && DEV_EDITOR)) && link("/editor", "Конструктор дел", route.page === "editor")}
        </nav>
        <div className="site-header__user row">
          <ThemeMenu />
          {server === "online" && me && <UserMenu />}
          {server !== "unknown" && !me && <SignedOut />}
        </div>
      </div>
    </header>
  );
}

/** Выбор темы оформления: значок палитры в шапке, список тем (запоминается в браузере). */
function ThemeMenu() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [ref]);
  useMenuKeys(open, ref);
  const choice = (value: ThemeName | null, label: string) => (
    <button
      role="menuitemradio"
      aria-checked={theme === value}
      onClick={() => {
        setTheme(value);
        setOpen(false);
      }}
    >
      {theme === value ? "✓ " : ""}
      {label}
    </button>
  );
  return (
    <div className="user-menu theme-menu" ref={ref}>
      <button className="icon-btn" aria-haspopup="menu" aria-expanded={open} title="Тема оформления" aria-label="Тема оформления" onClick={() => setOpen((v) => !v)}>
        <Icon name="palette" size={20} />
      </button>
      {open && (
        <div className="user-menu__popup" role="menu">
          {choice(null, DEFAULT_THEME_LABEL)}
          {THEMES.map((t) => (
            <Fragment key={t}>{choice(t, THEME_LABELS[t])}</Fragment>
          ))}
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
      <Link className="btn btn--primary btn--sm" to="/login">
        Вход
      </Link>
    </>
  );
}

function UserMenu() {
  const me = useAccount((s) => s.me)!;
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
          {item("/account", "Личный кабинет")}
          {isStaff(me) && item("/admin/groups", me.role === "admin" ? "Группы" : "Мои группы")}
          {isStaff(me) && item("/admin/events", "Мероприятия")}
          {isStaff(me) && (
            <a role="menuitem" href="/api/admin/offline" download>
              Скачать офлайн-версию
            </a>
          )}
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

// ---------- Главная ----------

function Landing() {
  const [howto, setHowto] = useState(false);
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  return (
    <div className="page landing">
      <section className="hero">
        <div className="hero__text">
          <p className="hero__kicker">Учебная игра</p>
          <h1>{APP_NAME}</h1>
          <p className="hero__lead">
            Осмотрите место, поговорите со свидетелями, сопоставьте улики — определите, какое право нарушено, кто за это
            отвечает и чем это доказать.
          </p>
          <div className="hero__actions">
            <Link className="btn btn--primary btn--big" to="/cases">
              Выбрать дело
            </Link>
            <button className="btn btn--big" onClick={() => setHowto(true)}>
              Как играть
            </button>
          </div>
          {server === "online" && !me && (
            <p className="muted hero__note">
              <Link to="/login">Войдите</Link> или <Link to="/register">зарегистрируйтесь</Link>, чтобы результаты видел преподаватель.
            </p>
          )}
        </div>
        <div className="hero__art" aria-hidden>
          <div className="hero__folder">
            <LogoArt />
          </div>
        </div>
      </section>
      <section className="features">
        <Feature n={1} title="Осмотрите" text="Ходите по кабинетам, изучайте документы и предметы — всё найденное попадает в материалы дела." />
        <Feature n={2} title="Расспросите" text="Задавайте вопросы, предъявляйте улики, устраивайте очные ставки — кто-то говорит неправду." />
        <Feature n={3} title="Сопоставьте" text="Два материала вместе дают вывод, выводы складываются в цепочку доказательств." />
        <Feature n={4} title="Решите" text="Какое право затронуто, было ли нарушение, кто отвечает и чем это подтверждается." />
      </section>
      {howto && <HowToWindow onClose={() => setHowto(false)} />}
    </div>
  );
}

const Feature = ({ n, title, text }: { n: number; title: string; text: string }) => (
  <div className="feature card">
    <span className="feature__n">{n}</span>
    <h3>{title}</h3>
    <p>{text}</p>
  </div>
);

// ---------- Дела: папки ----------

/** Мероприятия группы студента: дела, которые можно сдать зачётно. */
function EventsBlock({ cases }: { cases: CaseSummary[] | null }) {
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

function CasesPage() {
  const cases = useCaseList();
  const [howto, setHowto] = useState(false);
  return (
    <div className="page cases-page">
      <header className="page__head">
        <h1>Выберите дело</h1>
        <button className="btn" onClick={() => setHowto(true)}>
          <Icon name="help" size={16} /> Как играть
        </button>
      </header>
      <EventsBlock cases={cases} />
      <CaseList cases={cases} />
      {howto && <HowToWindow onClose={() => setHowto(false)} />}
    </div>
  );
}

// ---------- Личный кабинет ----------

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
          {me.status === "pending"
            ? `Преподаватель подтвердит вашу учётную запись${me.group ? "" : " и добавит в группу"}. Проходить дела можно уже сейчас. `
            : ""}
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
