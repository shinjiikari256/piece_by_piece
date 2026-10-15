import { CaseFile } from "../../../../shared/case";
import { parseCase } from "../../../../shared/migrate";
import { editor, editorStore } from "./state";
import { ask, tell } from "../ui/dialog";

/** Тестовый запуск в этой же вкладке; черновик в конструкторе никуда не денется. */
export function startPlaytest() {
  const { errors, draft } = editorStore.get();
  if (errors.length) return editor.goto("errors");
  editor.playtest();
  window.location.href = `/?play=${encodeURIComponent(draft.id)}&from=editor`;
}

export function downloadJson(c: CaseFile) {
  const blob = new Blob([JSON.stringify(c, null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${c.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importJsonFile(file: File) {
  try {
    const parsed = parseCase(JSON.parse(await file.text()));
    if (!parsed.success) {
      await tell({ title: "Файл не похож на дело", text: parsed.errors.slice(0, 8).join("\n") });
      return;
    }
    editor.open(parsed.data);
  } catch (e) {
    await tell({ title: "Не удалось прочитать файл", text: String(e) });
  }
}

/** Перед заменой текущего черновика другим делом. */
export function confirmReplace(action: () => void) {
  const { dirty } = editorStore.get();
  if (!dirty) return action();
  void ask({ title: "Несохранённые изменения пропадут", text: "В текущем деле есть несохранённые изменения. Открыть другое дело?", confirmLabel: "Продолжить", danger: true }).then(
    (ok) => ok && action(),
  );
}
