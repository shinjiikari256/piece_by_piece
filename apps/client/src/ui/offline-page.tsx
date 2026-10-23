import { useEffect, useState } from "react";
import { OFFLINE_VARIANTS, OFFLINE_VARIANT_LABEL, type OfflineVariant } from "../../../../shared/api";
import { isStaff, useAccount } from "../state/account";
import { api } from "../state/api";
import { tell } from "./dialog";

interface CaseRow {
  id: string;
  number: string;
  title: string;
}

const VARIANT_HINT: Record<OfflineVariant, string> = {
  game: "Как у студентов: дела можно проходить, результат сохраняется файлом. Без входа, личного кабинета и конструктора.",
  editor: "Игра и конструктор: дела можно править, черновики хранятся в браузере. Кнопка «Запустить» открывает дело в игре.",
};

/** Скачать офлайн-файл: вариант, дела (список с флагом «Все дела») и сборка файла на сервере. */
export function OfflinePage() {
  const me = useAccount((s) => s.me);
  const server = useAccount((s) => s.server);
  const staff = server === "online" && isStaff(me);
  const [available, setAvailable] = useState<OfflineVariant[] | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [variant, setVariant] = useState<OfflineVariant>("game");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!staff) return;
    api<{ variants: OfflineVariant[] }>("GET", "/admin/offline").then((r) => {
      setAvailable(r.variants);
      if (r.variants.length && !r.variants.includes("game")) setVariant(r.variants[0]);
    }, () => setAvailable([]));
    api<CaseRow[]>("GET", "/admin/cases").then(setCases, () => setCases([]));
  }, [staff]);

  if (!staff)
    return (
      <div className="page page--narrow">
        <h1>Офлайн-версия</h1>
        <p className="muted">Раздел доступен преподавателям и администратору.</p>
      </div>
    );

  const all = cases.length > 0 && cases.every((c) => picked.includes(c.id));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/offline", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        // порядок — как в списке дел, а не как кликали
        body: JSON.stringify({ variant, caseIds: cases.filter((c) => picked.includes(c.id)).map((c) => c.id) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message ?? "Не удалось собрать файл");
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await res.blob());
      a.download = variant === "editor" ? "delo-editor.html" : "delo.html";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      void tell({ title: "Офлайн-версия", text: e instanceof Error ? e.message : "Не удалось собрать файл" });
    } finally {
      setBusy(false);
    }
  };

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
          void download();
        }}
      >
        <fieldset className="stack">
          <legend className="muted small">Вариант</legend>
          {OFFLINE_VARIANTS.map((v) => (
            <label key={v} className="form__check">
              <input type="radio" name="variant" checked={variant === v} disabled={!available?.includes(v)} onChange={() => setVariant(v)} />
              <b>{OFFLINE_VARIANT_LABEL[v]}</b>
              <span className="muted small">— {available && !available.includes(v) ? "не подготовлен на сервере" : VARIANT_HINT[v]}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="stack">
          <legend className="muted small">Дела</legend>
          <label className="form__check">
            <input type="checkbox" checked={all} onChange={(e) => setPicked(e.target.checked ? cases.map((c) => c.id) : [])} />
            <b>Все дела</b>
          </label>
          {cases.map((c) => (
            <label key={c.id} className="form__check">
              <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
              <span>
                №{c.number} «{c.title}»
              </span>
            </label>
          ))}
        </fieldset>
        <p className="muted small">Ответы лежат в самом файле: проверка идёт в браузере, поэтому файл подходит для самостоятельной подготовки, а не для зачёта.</p>
        <div className="row">
          <button className="btn btn--primary" type="submit" disabled={busy || !picked.length || !available?.includes(variant)}>
            {busy ? "Собираем…" : "Скачать"}
          </button>
        </div>
      </form>
    </div>
  );
}
