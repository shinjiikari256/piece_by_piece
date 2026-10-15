import { useEffect } from "react";
import { FROM_EDITOR, OFFLINE } from "../env";
import { actions, store, useGame } from "../state/store";
import { editorPathOfPlaytest, readPlaytest } from "../content/drafts";
import { validateCase } from "../content/validate";
import { LocalAuthority } from "../content/local-authority";
import { caseRepository } from "../content/repository";
import { currentRoute, navigate, subscribeRoute, type Route } from "./router";
import { tell } from "./dialog";

/**
 * Расследование в адресе: `/play/<дело>` (тестовый запуск из конструктора — `/playtest`).
 * Перезагрузка возвращает в дело по сохранению (нет сохранения — вступление); «назад» из игры спрашивает про выход.
 */

const playPath = (caseId: string) => (FROM_EDITOR ? "/playtest" : `/play/${encodeURIComponent(caseId)}`);

let loading = false;

async function loadFromUrl(route: Route) {
  if (loading) return;
  loading = true;
  try {
    if (route.page === "playtest") {
      const result = OFFLINE ? null : validateCase(readPlaytest());
      if (!result?.ok) throw new Error("Тестовая копия не найдена или содержит ошибки — откройте конструктор.");
      await actions.resume(new LocalAuthority(result.caseFile));
    } else if (route.page === "play") {
      await actions.resume(await caseRepository.open(route.caseId));
    }
  } catch (e) {
    navigate(FROM_EDITOR ? editorPathOfPlaytest() : "/cases", { replace: true });
    void tell({ title: "Не удалось открыть дело", text: e instanceof Error && FROM_EDITOR ? e.message : "Такого дела нет. Выберите дело из списка." });
  } finally {
    loading = false;
  }
}

function onRoute() {
  const route = currentRoute();
  const { screen, caseFile } = store.get();
  if (route.page === "play" || route.page === "playtest") {
    if (screen === "menu") void loadFromUrl(route);
  } else if (screen === "intro" || screen === "result") {
    actions.leaveToSite();
  } else if (caseFile && (screen === "play" || screen === "final")) {
    // ушли из расследования стрелкой «назад» или ссылкой: остаёмся в нём и спрашиваем про выход
    navigate(playPath(caseFile.id));
    if (screen === "final") actions.backToInvestigation();
    actions.open({ kind: "exit" });
  }
}

/** Связывает адрес и расследование; монтируется один раз в `App`. */
export function useGameRoute() {
  const screen = useGame((s) => s.screen);
  const caseId = useGame((s) => s.caseFile?.id);

  // состояние → адрес: результат живёт на своей странице, его адрес не трогаем
  useEffect(() => {
    if (caseId && (screen === "intro" || screen === "play" || screen === "final")) navigate(playPath(caseId), { scroll: false });
  }, [screen, caseId]);

  // адрес → состояние: при загрузке и при переходах
  useEffect(() => {
    // при загрузке — только открыть дело из адреса (игра, уже запущенная кодом, например из конструктора, адрес ещё не получила)
    const route = currentRoute();
    if ((route.page === "play" || route.page === "playtest") && store.get().screen === "menu") void loadFromUrl(route);
    return subscribeRoute(onRoute);
  }, []);
}
