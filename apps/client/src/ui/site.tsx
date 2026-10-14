import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ROLE_LABEL, STATUS_LABEL } from "../../../../shared/api";
import { APP_NAME, DEV_EDITOR, OFFLINE } from "../env";
import { account, isStaff, pendingJoinToken, useAccount } from "../state/account";
import { useGuestName } from "../state/profile";
import { AuthPage, PasswordForm } from "./account";
import { Field } from "./account";
import { AdminPage, StatusChip } from "./admin";
import { Loader } from "./loader";
import { useDismiss } from "./hooks";
import { initials, shortName } from "../util/names";
import { Icon } from "./icons";
import { Logo, LogoArt } from "./logo";
import { navigate, useRoute, type Route } from "./router";
import { CaseList, HowToContent, HowToWindow, useCaseList } from "./screens";
import { ResultsPage } from "./results-page";

/** Конструктор — отдельным куском по требованию; в офлайн-файле его нет вовсе. */
const EditorRoute = OFFLINE ? null : lazy(() => import("../editor/EditorRoute"));


/** Сайт вокруг игры: шапка и обычные страницы. Папки — только у дел. */
export function Site() {
  const route = useRoute();
  // открыли по ссылке регистрации — сразу форма
  useEffect(() => {
    if (pendingJoinToken() && route.page !== "register") navigate("#/register");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="site">
      <SiteHeader route={route} />
      <main className={`site__main ${route.page === "editor" ? "site__main--editor" : ""}`}>
        {route.page === "home" && <Landing />}
        {route.page === "cases" && <CasesPage />}
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
  const link = (href: string, label: string, active: boolean) => (
    <a href={href} className="site-nav__link" aria-current={active ? "page" : undefined}>
      {label}
    </a>
  );
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="logo" href="#/">
          <Logo />
          {APP_NAME}
        </a>
        <nav className="site-nav">
          {link("#/cases", "Дела", route.page === "cases")}
          {link("#/results", "Результаты", route.page === "results")}
          {staff && link("#/admin/users", "Пользователи", route.page === "admin" && route.section === "users")}
          {(staff || (server === "none" && DEV_EDITOR)) && link("#/editor", "Конструктор дел", route.page === "editor")}
        </nav>
        <div className="site-header__user">
          {server === "online" && me && <UserMenu />}
          {server !== "unknown" && !me && <SignedOut />}
        </div>
      </div>
    </header>
  );
}

/** Без входа: имя гостя (если указал) и «Вход». */
function SignedOut() {
  const guest = useGuestName();
  return (
    <>
      {guest && (
        <a className="site-guest" href="#/guest" title="Вы играете как гость — изменить ФИО">
          {shortName(guest)} <span>гость</span>
        </a>
      )}
      <a className="btn btn--primary btn--sm" href="#/login">
        Вход
      </a>
    </>
  );
}

function UserMenu() {
  const me = useAccount((s) => s.me)!;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), [ref]);
  const item = (href: string, label: string) => (
    <a href={href} role="menuitem" onClick={() => setOpen(false)}>
      {label}
    </a>
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
          {item("#/account", "Личный кабинет")}
          {isStaff(me) && item("#/admin/groups", me.role === "admin" ? "Группы" : "Мои группы")}
          {me.role === "admin" && item("#/admin/settings", "Настройки")}
          <hr />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void account.logout().then(() => navigate("#/"));
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
            <a className="btn btn--primary btn--big" href="#/cases">
              Выбрать дело
            </a>
            <button className="btn btn--big" onClick={() => setHowto(true)}>
              Как играть
            </button>
          </div>
          {server === "online" && !me && (
            <p className="muted hero__note">
              <a href="#/login">Войдите</a> или <a href="#/register">зарегистрируйтесь</a>, чтобы результаты видел преподаватель.
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
    if (server === "online" && !me) navigate("#/login");
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
