import type { CaseFile } from "../../../../shared/case";
import { validateCase } from "../content/validate";
import { ask, tell } from "../ui/kit/dialog";
import { ApiFailure, api } from "../state/api";

/** Версия дела на сервере, с которой начали правку (id дела → id версии): по ней сервер ловит чужую правку. Живёт до перезагрузки страницы. */
const baseVersions = new Map<string, number>();
export const rememberServerVersion = (caseId: string, versionId: number) => void baseVersions.set(caseId, versionId);

/** Записать сохранённый локальный черновик на сервер новой версией: вошедшие игроки увидят её сразу (если дело показывается в списке). Только онлайн-сборка. Возвращает true, если запись прошла. */
export async function publishToServer(draft: CaseFile): Promise<boolean> {
  const checked = validateCase(draft);
  if (!checked.ok) {
    await tell({ title: "Черновик не проходит проверку", text: `Откройте дело в редакторе и исправьте ошибки:\n${checked.errors.slice(0, 8).join("\n")}` });
    return false;
  }
  const ok = await ask({
    title: "Записать дело на сервер?",
    text: `Дело «${draft.title}» станет новой действующей версией. Начатые прохождения продолжатся на прежней версии.\n\nНажимая «Подтверждаю», вы заявляете, что являетесь автором дела или имеете право его публиковать, и разрешаете платформе хранить и показывать его игрокам в пределах игры.`,
    confirmLabel: "Подтверждаю",
  });
  if (!ok) return false;
  const url = `/admin/cases/${encodeURIComponent(draft.id)}`;
  try {
    const put = (base?: number) => api<{ result: "created" | "same"; versionId: number | null }>("PUT", `${url}?rights=1${base === undefined ? "" : `&base=${base}`}`, draft);
    let res;
    try {
      res = await put(baseVersions.get(draft.id));
    } catch (e) {
      if (!(e instanceof ApiFailure) || e.status !== 409) throw e;
      const overwrite = await ask({
        title: "Дело на сервере изменили",
        text: "После того как вы открыли дело, на сервере появилась более новая версия (возможно, от соавтора). Если записать сейчас, её содержимое будет заменено вашим, но останется в истории версий.\n\nЗаписать поверх?",
        confirmLabel: "Записать поверх",
        danger: true,
      });
      if (!overwrite) return false;
      const { versionId } = await api<{ versionId: number }>("GET", url);
      res = await put(versionId);
    }
    const { result } = res;
    if (res.versionId !== null) baseVersions.set(draft.id, res.versionId);
    await tell({ title: result === "created" ? "Версия записана" : "Без изменений", text: result === "created" ? "Дело на сервере обновлено." : "На сервере уже такая же версия." });
    return true;
  } catch (e) {
    await tell({ title: "Не удалось записать", text: e instanceof ApiFailure ? e.message : "Нет связи с сервером." });
    return false;
  }
}
