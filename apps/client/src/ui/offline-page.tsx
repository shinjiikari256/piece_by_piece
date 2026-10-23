import { OFFLINE_VARIANTS } from "../../../../shared/api";
import { isStaff, useAccount } from "../state/account";
import { CaseOption, VariantOption } from "./offline/options";
import { useOfflineBuild } from "./offline/use-offline-build";

/** Скачать офлайн-файл: вариант, дела (список с флагом «Все дела») и сборка файла на сервере. */
export function OfflinePage() {
  const me = useAccount((s) => s.me);
  const server = useAccount((s) => s.server);
  const staff = server === "online" && isStaff(me);
  const build = useOfflineBuild(staff);

  if (!staff)
    return (
      <div className="page page--narrow">
        <h1>Офлайн-версия</h1>
        <p className="muted">Раздел доступен преподавателям и администратору.</p>
      </div>
    );

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <h1>Офлайн-версия</h1>
      </header>
      <p className="muted">Один .html-файл с выбранными делами: открывается с диска, без сети и сервера.</p>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void build.download();
        }}
      >
        <fieldset className="stack">
          <legend className="muted small">Вариант</legend>
          {OFFLINE_VARIANTS.map((v) => (
            <VariantOption
              key={v}
              variant={v}
              checked={build.variant === v}
              ready={!!build.available?.includes(v)}
              missing={!!build.available && !build.available.includes(v)}
              onSelect={() => build.setVariant(v)}
            />
          ))}
        </fieldset>
        <fieldset className="stack">
          <legend className="muted small">Дела</legend>
          <label className="form__check">
            <input type="checkbox" checked={build.allPicked} onChange={(e) => build.toggleAll(e.target.checked)} />
            <b>Все дела</b>
          </label>
          {build.cases.map((c) => (
            <CaseOption key={c.id} row={c} checked={build.picked.includes(c.id)} onToggle={() => build.toggle(c.id)} />
          ))}
        </fieldset>
        <p className="muted small">Ответы лежат в самом файле: проверка идёт в браузере, поэтому файл подходит для самостоятельной подготовки, а не для зачёта.</p>
        <div className="row">
          <button className="btn btn--primary" type="submit" disabled={!build.canDownload}>
            {build.busy ? "Собираем…" : "Скачать"}
          </button>
        </div>
      </form>
    </div>
  );
}
