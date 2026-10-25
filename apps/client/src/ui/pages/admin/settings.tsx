import { useEffect, useState } from "react";
import { type ApiTokenInfo, type Settings } from "../../../../../../shared/api";
import { api } from "../../../state/api";
import { ask } from "../../kit/dialog";
import { date } from "./index";
import { fail } from "./index";

// ---------- Настройки ----------

export function SettingsSection() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => void api<Settings>("GET", "/admin/settings").then(setSettings, fail), []);
  if (!settings) return null;
  const toggle = async () => {
    try {
      setSettings(await api<Settings>("PUT", "/admin/settings", { registrationOpen: !settings.registrationOpen }));
    } catch (e) {
      fail(e);
    }
  };
  return (
    <section>
      <header className="page__head">
        <h1>Настройки</h1>
      </header>
      <div className="card">
        <label className="form__check">
          <input type="checkbox" checked={settings.registrationOpen} onChange={() => void toggle()} />
          <span>
            <b>Регистрация открыта</b>
            <br />
            Любой может создать учётную запись, в том числе по ссылкам групп. Закройте, если регистрация не нужна или появились посторонние.
          </span>
        </label>
      </div>
      <TokensCard />
    </section>
  );
}

/** API-токены: скрипт или ассистент читает и обновляет дела по ключу (`GET/PUT /api/admin/cases/<ключ>`, заголовок `Authorization: Bearer …`). */
function TokensCard() {
  const [tokens, setTokens] = useState<ApiTokenInfo[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const load = () => api<ApiTokenInfo[]>("GET", "/admin/tokens").then(setTokens, fail);
  useEffect(() => void load(), []);
  const create = async () => {
    try {
      const res = await api<{ token: string }>("POST", "/admin/tokens", { name });
      setFresh(res.token);
      setName("");
      await load();
    } catch (e) {
      fail(e);
    }
  };
  const revoke = async (t: ApiTokenInfo) => {
    if (!(await ask({ title: `Отозвать токен «${t.name}»?`, text: "Скрипты с этим токеном перестанут работать.", confirmLabel: "Отозвать", danger: true }))) return;
    try {
      await api("DELETE", `/admin/tokens/${t.id}`);
      await load();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div className="card stack">
      <b>API-токены</b>
      <p className="muted small">
        Дают скрипту или ассистенту читать и обновлять дела по ключу от вашего имени: <code>GET</code>/<code>PUT /api/admin/cases/&lt;ключ&gt;?rights=1</code> с заголовком <code>Authorization: Bearer …</code>. Больше ничего по токену недоступно.
      </p>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input className="input toolbar__search" value={name} onChange={(e) => setName(e.target.value)} placeholder="Название, например «Ассистент»" />
        <button className="btn btn--primary" type="submit" disabled={!name.trim()}>
          Создать токен
        </button>
      </form>
      {fresh && (
        <div className="stack">
          <span className="small">Скопируйте токен сейчас — потом он не будет показан:</span>
          <input className="input mono" value={fresh} readOnly onFocus={(e) => e.target.select()} />
        </div>
      )}
      <ul className="list-reset stack">
        {tokens.map((t) => (
          <li key={t.id} className="row">
            <b>{t.name}</b>
            <span className="muted small">
              создан {date(t.createdAt)} · {t.lastUsedAt ? `использован ${date(t.lastUsedAt)}` : "не использовался"}
              {t.revokedAt && ` · отозван ${date(t.revokedAt)}`}
            </span>
            {!t.revokedAt && (
              <button className="linkbtn linkbtn--danger" onClick={() => void revoke(t)}>
                Отозвать
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
