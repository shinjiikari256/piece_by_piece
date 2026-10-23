import { Suspense, lazy, useRef, useState, Fragment } from "react";
import { APP_NAME, OFFLINE, OFFLINE_EDITOR } from "../env";
import { useAccount } from "../state/account";
import { Loader } from "./loader";
import { DEFAULT_THEME_LABEL, THEMES, THEME_LABELS, setTheme, useTheme, type ThemeName } from "./theme";
import { useDismiss, useMenuKeys } from "./hooks";
import { Icon } from "./icons";
import { Logo, LogoArt } from "./logo";
import { Link, useRoute, type Route } from "./router";
import { PhoneMenu, useSiteLinks } from "./site-nav";
import { CaseList, HowToContent, HowToWindow, useCaseList } from "./screens";
import { ResultsPage } from "./results-page";

/** Конструктор — отдельным куском по требованию; в офлайн-файле его нет вовсе. */
const EditorRoute = OFFLINE && !OFFLINE_EDITOR ? null : lazy(() => import("../editor/EditorRoute"));

/** Онлайн-часть (вход, кабинет, админка, мероприятия) — отдельным куском; в офлайн-файле её нет вовсе. */
const loadOnline = () => import("./online");
const OnlineHeader = OFFLINE ? null : lazy(() => loadOnline().then((m) => ({ default: m.OnlineHeader })));
const OnlinePage = OFFLINE ? null : lazy(() => loadOnline().then((m) => ({ default: m.OnlinePage })));
const OnlineEvents = OFFLINE ? null : lazy(() => loadOnline().then((m) => ({ default: m.OnlineEvents })));

/** Сайт вокруг игры: шапка и обычные страницы. Папки — только у дел. */
export function Site() {
  const route = useRoute();
  return (
    <div className="site">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
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
        {OnlinePage && (
          <Suspense fallback={null}>
            <OnlinePage route={route} />
          </Suspense>
        )}
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
  const links = useSiteLinks(route);
  // вход: на телефоне кнопка «Вход» в шапке скрыта, он пунктом меню
  const login = !OFFLINE && server !== "unknown" && !me;
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="logo" to="/">
          <Logo />
          {APP_NAME}
        </Link>
        <nav className="site-nav" aria-label="Разделы сайта">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="site-nav__link" aria-current={l.active ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="site-header__user row">
          <ThemeMenu />
          {!me && (
            <PhoneMenu route={route}>
              {login && (
                <Link role="menuitem" to="/login">
                  Вход
                </Link>
              )}
            </PhoneMenu>
          )}
          {OnlineHeader && (
            <Suspense fallback={null}>
              <OnlineHeader route={route} />
            </Suspense>
          )}
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
          <p className="hero__lead">Осмотрите место, поговорите со свидетелями, сопоставьте улики — определите, какое право нарушено, кто за это отвечает и чем это доказать.</p>
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
      {OnlineEvents && (
        <Suspense fallback={null}>
          <OnlineEvents cases={cases} />
        </Suspense>
      )}
      <CaseList cases={cases} />
      {howto && <HowToWindow onClose={() => setHowto(false)} />}
    </div>
  );
}
