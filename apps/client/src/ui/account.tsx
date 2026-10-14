import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { CONSENT_TEXT, type JoinInfo } from "../../../../shared/api";
import { ApiFailure, account, api, clearJoinToken, pendingJoinToken, useAccount } from "../state/account";
import { Alert } from "./alert";
import { Dialog } from "./window";
import { Link, navigate, useRoute } from "./router";
import { Folder } from "./screens";
import { EMPTY_PROFILE, platform } from "../state/platform";
import { usePlatformValue } from "../state/platform-hooks";

const message = (e: unknown) => (e instanceof ApiFailure ? e.message : "Что-то пошло не так. Попробуйте ещё раз.");

/** Отправка формы с блокировкой кнопки и текстом ошибки. */
function useSubmit(run: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <small className="field__hint">{hint}</small>}
    </label>
  );
}

type AuthTab = "guest" | "login" | "register";

const AUTH_TABS = [
  { id: "guest", label: "БЕЗ ВХОДА" },
  { id: "login", label: "ВХОД" },
  { id: "register", label: "РЕГИСТРАЦИЯ" },
];

/**
 * Вход — стандартная папка с вкладками «Без входа / Вход / Регистрация» (по умолчанию «Вход»).
 * Лист постоянной высоты: не скачет при переключении. Без сервера входить и регистрироваться некуда — только гость.
 */
export function AuthPage({ tab }: { tab: AuthTab }) {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  // уже вошли — вкладки входа ни к чему: сразу в личный кабинет
  const route = useRoute();
  useEffect(() => {
    // форма входа/регистрации сама уводит дальше — перенаправляем, только если адрес всё ещё здесь
    if (me && ["login", "register", "guest"].includes(route.page)) navigate("/account");
  }, [me, route.page]);
  if (server === "unknown" || me) return null;
  return (
    <div className="auth-folder">
      <Folder tabs={AUTH_TABS} active={tab} onTab={(id) => navigate(`/${id}`)}>
        {tab === "guest" ? (
          <GuestForm />
        ) : server !== "online" ? (
          <NoServer />
        ) : tab === "login" ? (
          <LoginForm />
        ) : (
          <RegisterForm />
        )}
      </Folder>
    </div>
  );
}

function NoServer() {
  return (
    <div className="auth-pane">
      <h1>Нет связи с сервером</h1>
      <p className="muted">
        Вход и регистрация работают, когда доступен сервер. Сейчас можно играть без входа — результаты останутся в этом браузере.
      </p>
      <Link className="btn btn--primary" to="/guest">
        Играть без входа
      </Link>
    </div>
  );
}

function LoginForm() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, submit } = useSubmit(async () => {
    await account.login({ login, password });
    navigate("/");
  });
  return (
    <form className="form auth-pane" onSubmit={submit}>
      <h1>Вход</h1>
      <Field label="Логин">
        <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus required />
      </Field>
      <Field label="Пароль">
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </Field>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
        Войти
      </button>
      <p className="muted form__note">Забыли пароль? Обратитесь к преподавателю.</p>
    </form>
  );
}

function RegisterForm() {
  const [token] = useState(pendingJoinToken);
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [joinError, setJoinError] = useState("");
  const [form, setForm] = useState({ login: "", fullName: "", password: "", repeat: "", consent: false });
  const edit = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  useEffect(() => {
    if (!token) return;
    api<JoinInfo>("GET", `/join/${encodeURIComponent(token)}`).then(setJoin, (e) => setJoinError(message(e)));
  }, [token]);
  const { busy, error, submit } = useSubmit(async () => {
    if (form.password !== form.repeat) throw new ApiFailure(400, "mismatch", "Пароли не совпадают");
    await account.register({
      login: form.login,
      fullName: form.fullName,
      password: form.password,
      consent: form.consent as true,
      joinToken: join ? (token ?? undefined) : undefined,
    });
    clearJoinToken();
    navigate("/account");
  });
  return (
    <form className="form auth-pane" onSubmit={submit}>
      <h1>Регистрация</h1>
      {join && (
        <Alert tone="info">
          Вы регистрируетесь в группу <b>{join.group.name}</b>
        </Alert>
      )}
      {joinError && <Alert>{joinError} Можно зарегистрироваться без группы — преподаватель добавит вас сам.</Alert>}
      <Field label="ФИО">
        <input className="input" value={form.fullName} onChange={(e) => edit({ fullName: e.target.value })} placeholder="Иванова Анна Сергеевна" autoComplete="name" autoFocus required />
      </Field>
      <Field label="Логин" hint="Латинские буквы, цифры, точка, дефис">
        <input className="input" value={form.login} onChange={(e) => edit({ login: e.target.value })} autoComplete="username" required />
      </Field>
      <Field label="Пароль" hint="Не меньше 8 символов">
        <input className="input" type="password" value={form.password} onChange={(e) => edit({ password: e.target.value })} autoComplete="new-password" required />
      </Field>
      <Field label="Повторите пароль">
        <input className="input" type="password" value={form.repeat} onChange={(e) => edit({ repeat: e.target.value })} autoComplete="new-password" required />
      </Field>
      <label className="form__check">
        <input type="checkbox" checked={form.consent} onChange={(e) => edit({ consent: e.target.checked })} />
        <span>{CONSENT_TEXT}</span>
      </label>
      {error && <Alert>{error}</Alert>}
      <button className="btn btn--primary btn--block" type="submit" disabled={busy || !form.consent}>
        Зарегистрироваться
      </button>
    </form>
  );
}

/** Гость: только ФИО — оно попадёт в грамоту, PDF результата и файл для преподавателя. */
function GuestForm() {
  const [saved] = usePlatformValue(() => platform().profile.read(), EMPTY_PROFILE);
  const [typed, setTyped] = useState<string | null>(null);
  const name = typed ?? saved.name;
  const [done, setDone] = useState(false);
  return (
    <form
      className="form auth-pane"
      onSubmit={(e) => {
        e.preventDefault();
        void platform().profile.read().then((profile) => platform().profile.write({ ...profile, name: name.trim() }));
        setDone(true);
      }}
    >
      <h1>Без входа</h1>
      <p className="muted">Можно играть как гость: результаты останутся в этом браузере. Укажите ФИО — оно попадёт в грамоту и файлы результата.</p>
      <Field label="ФИО">
        <input
          className="input"
          value={name}
          onChange={(e) => {
            setTyped(e.target.value);
            setDone(false);
          }}
          placeholder="Иванова Анна Сергеевна"
          autoComplete="name"
        />
      </Field>
      {done && <p className="form__ok">Сохранено в этом браузере.</p>}
      <button className="btn btn--primary btn--block" type="submit">
        Сохранить
      </button>
    </form>
  );
}

export function PasswordForm({ temporary, onDone }: { temporary?: boolean; onDone?: () => void }) {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [repeat, setRepeat] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, submit } = useSubmit(async () => {
    if (newPassword !== repeat) throw new ApiFailure(400, "mismatch", "Пароли не совпадают");
    await account.changePassword({ oldPassword: temporary ? undefined : oldPassword, newPassword });
    setOld("");
    setNew("");
    setRepeat("");
    setDone(true);
    onDone?.();
  });
  return (
    <form className="form" onSubmit={submit}>
      {!temporary && (
        <Field label="Текущий пароль">
          <input className="input" type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" required />
        </Field>
      )}
      <div className="pair">
        <Field label="Новый пароль" hint="Не меньше 8 символов">
          <input className="input" type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field label="Повторите пароль">
          <input className="input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
        </Field>
      </div>
      {error && <Alert>{error}</Alert>}
      {done && !error && <p className="form__ok">Пароль изменён. На других устройствах нужно будет войти заново.</p>}
      <button className="btn btn--primary" type="submit" disabled={busy}>
        Сохранить пароль
      </button>
    </form>
  );
}

/** Вошли с временным паролем — сначала задать свой. Монтируется в игре и в конструкторе. */
export function ForcePasswordChange() {
  const me = useAccount((s) => s.me);
  if (!me?.mustChangePassword) return null;
  return (
    <Dialog title="Задайте свой пароль" className="auth-force">
      <p className="muted">Вы вошли с временным паролем, который выдал преподаватель. Придумайте новый — дальше входите с ним.</p>
      <PasswordForm temporary />
      <button className="btn" onClick={() => void account.logout()}>
        Выйти
      </button>
    </Dialog>
  );
}
