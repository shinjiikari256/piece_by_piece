import { useEffect, useLayoutEffect, useRef } from "react";
import type { CaseFile } from "../../../../shared/case";
import { caseRepository } from "../content/repository";
import { readDraft } from "../content/drafts";
import { validateCase } from "../content/validate";
import { ask } from "../ui/kit/dialog";
import { navigate, routeHref, setSearchParams, useRoute, useSearchParam } from "../ui/lib/router";
import { accountStore } from "../state/account";
import { editor, editorStore, useEditor, type SectionId } from "./state";

/** Дело для конструктора по id: сохранённый черновик, иначе встроенное (как на стартовой странице). */
function findCase(id: string): CaseFile | undefined {
  const draft = validateCase(readDraft(id));
  if (draft.ok) return draft.caseFile;
  return accountStore.get().server === "online" ? undefined : caseRepository.bundled().find((c) => c.id === id);
}

/**
 * Положение в конструкторе — в адресе: `/editor` — стартовая страница, `/editor/<дело>/<раздел>` — раздел дела.
 * Адрес главнее при загрузке и «назад/вперёд»; дальше состояние пишет адрес. Если по адресу другое дело,
 * а в текущем есть несохранённые правки, сначала спрашиваем.
 */
export function useEditorUrl(sectionIds: readonly string[]) {
  const route = useRoute();
  const screen = useEditor((s) => s.screen);
  const section = useEditor((s) => s.section);
  const caseId = useEditor((s) => s.draft.id);

  // адрес → состояние
  const caseInUrl = route.page === "editor" ? route.caseId : undefined;
  const sectionInUrl = route.page === "editor" ? route.section : undefined;
  useEffect(() => {
    if (route.page !== "editor") return;
    const st = editorStore.get();
    if (!caseInUrl) {
      if (st.screen !== "home") editor.openHome();
      return;
    }
    const wanted: SectionId = sectionIds.includes(sectionInUrl ?? "") ? (sectionInUrl as SectionId) : "general";
    if (st.draft.id === caseInUrl) {
      if (st.screen !== "case" || st.section !== wanted) editor.goto(wanted);
      return;
    }
    const target = findCase(caseInUrl);
    if (!target) return void navigate(routeHref({ page: "editor" }), { replace: true });
    const open = () => {
      editor.open(structuredClone(target));
      if (wanted !== "general") editor.goto(wanted);
    };
    if (!st.dirty) return open();
    void ask({ title: "Несохранённые изменения пропадут", text: "В текущем деле есть несохранённые изменения. Открыть другое дело?", confirmLabel: "Продолжить", danger: true }).then((ok) =>
      ok ? open() : navigate(routeHref({ page: "editor", caseId: editorStore.get().draft.id, section: editorStore.get().section }), { replace: true }),
    );
  }, [route.page, caseInUrl, sectionInUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // состояние → адрес (первый рендер не трогаем: адрес главнее)
  // useLayoutEffect: путь должен смениться раньше, чем разделы допишут в адрес свои параметры (их эффекты — после)
  const last = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = routeHref(screen === "home" ? { page: "editor" } : { page: "editor", caseId, section });
    if (last.current === null) {
      last.current = target;
      return;
    }
    if (target !== last.current) {
      last.current = target;
      // адрес уже указывает сюда (загрузка по ссылке, «назад») — параметры (?item=…) не трогаем
      if (location.pathname !== target) navigate(target);
    }
  }, [screen, caseId, section]);
}

/**
 * Состояние раздела в параметре адреса (`?item=loc_hall`, `?tab=links`): переживает перезагрузку и копируется ссылкой.
 * Нет параметра или значение не из `allowed` — `fallback`; значение по умолчанию в адресе не пишется.
 * При смене раздела адрес собирается заново, и параметры сбрасываются.
 */
export function useUrlParam<T extends string = string>(name: string, fallback: NoInfer<T>, allowed?: readonly string[]): [T, (value: T) => void] {
  const raw = useSearchParam(name);
  const value = (raw !== null && (!allowed || allowed.includes(raw)) ? raw : fallback) as T;
  return [value, (next) => setSearchParams({ [name]: next === fallback ? null : next })];
}

/** Выбор по умолчанию (первый элемент) тоже пишется в адрес: ссылка всегда показывает, что открыто. */
export function useWriteDefaultParam(name: string, valid: boolean, firstKey: string | undefined) {
  useEffect(() => {
    if (!valid && firstKey) setSearchParams({ [name]: firstKey });
  }, [name, valid, firstKey]);
}
