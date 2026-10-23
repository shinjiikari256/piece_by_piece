import { useEffect, useState } from "react";
import type { OfflineVariant } from "../../../../../../shared/api";
import { api } from "../../../state/api";
import { tell } from "../../kit/dialog";

export interface CaseRow {
  id: string;
  number: string;
  title: string;
}

/** Состояние шаблона варианта на сервере: список ещё грузится, шаблон собран или его нет. */
export type VariantStatus = "loading" | "ready" | "missing";

/** Собрать файл на сервере и отдать его браузеру как скачивание. */
async function downloadOfflineFile(variant: OfflineVariant, caseIds: string[]) {
  const res = await fetch("/api/admin/offline", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variant, caseIds }),
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
}

/** Состояние страницы «Офлайн-версия»: доступные варианты, список дел, выбор и сборка файла. */
export function useOfflineBuild(enabled: boolean) {
  const [available, setAvailable] = useState<OfflineVariant[] | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [variant, setVariant] = useState<OfflineVariant>("game");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    api<{ variants: OfflineVariant[] }>("GET", "/admin/offline").then(
      (r) => {
        setAvailable(r.variants);
        if (r.variants.length && !r.variants.includes("game")) setVariant(r.variants[0]);
      },
      () => setAvailable([]),
    );
    api<CaseRow[]>("GET", "/admin/cases").then(setCases, () => setCases([]));
  }, [enabled]);

  const allPicked = cases.length > 0 && cases.every((c) => picked.includes(c.id));
  const variantStatus = (v: OfflineVariant): VariantStatus => (!available ? "loading" : available.includes(v) ? "ready" : "missing");

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleAll = (on: boolean) => setPicked(on ? cases.map((c) => c.id) : []);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // порядок — как в списке дел, а не как кликали
      await downloadOfflineFile(
        variant,
        cases.filter((c) => picked.includes(c.id)).map((c) => c.id),
      );
    } catch (e) {
      void tell({ title: "Офлайн-версия", text: e instanceof Error ? e.message : "Не удалось собрать файл" });
    } finally {
      setBusy(false);
    }
  };

  return {
    variantStatus,
    cases,
    variant,
    setVariant,
    picked,
    allPicked,
    toggle,
    toggleAll,
    busy,
    canDownload: !busy && picked.length > 0 && variantStatus(variant) === "ready",
    download,
  };
}
