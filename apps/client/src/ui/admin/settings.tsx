import { useEffect, useState } from "react";
import {
  type Settings,
} from "../../../../../shared/api";
import { api } from "../../state/account";
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
    </section>
  );
}
