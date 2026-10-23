import type { CaseFile } from "../../../../shared/case";
import { validateCase } from "../content/validate";
import { ask, tell } from "../ui/kit/dialog";
import { ApiFailure, api } from "../state/api";

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
  try {
    const { result } = await api<{ result: "created" | "same" }>("PUT", `/admin/cases/${encodeURIComponent(draft.id)}?rights=1`, draft);
    await tell({ title: result === "created" ? "Версия записана" : "Без изменений", text: result === "created" ? "Дело на сервере обновлено." : "На сервере уже такая же версия." });
    return true;
  } catch (e) {
    await tell({ title: "Не удалось записать", text: e instanceof ApiFailure ? e.message : "Нет связи с сервером." });
    return false;
  }
}
