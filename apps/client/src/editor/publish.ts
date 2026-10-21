import { editor, editorStore } from "./state";
import { ask, tell } from "../ui/dialog";
import { ApiFailure, api } from "../state/api";

/** Записать дело на сервер новой версией: вошедшие игроки увидят её сразу (если дело показывается в списке). Только онлайн-сборка. */
export async function publishToServer() {
  const { errors, draft } = editorStore.get();
  if (errors.length) return editor.goto("errors");
  const ok = await ask({
    title: "Записать дело на сервер?",
    text: `Дело «${draft.title}» станет новой действующей версией. Начатые прохождения продолжатся на прежней версии.\n\nНажимая «Подтверждаю», вы заявляете, что являетесь автором дела или имеете право его публиковать, и разрешаете платформе хранить и показывать его игрокам в пределах игры.`,
    confirmLabel: "Подтверждаю",
  });
  if (!ok) return;
  try {
    const { result } = await api<{ result: "created" | "same" }>("PUT", `/admin/cases/${encodeURIComponent(draft.id)}?rights=1`, draft);
    await tell({ title: result === "created" ? "Версия записана" : "Без изменений", text: result === "created" ? "Дело на сервере обновлено." : "На сервере уже такая же версия." });
  } catch (e) {
    await tell({ title: "Не удалось записать", text: e instanceof ApiFailure ? e.message : "Нет связи с сервером." });
  }
}
