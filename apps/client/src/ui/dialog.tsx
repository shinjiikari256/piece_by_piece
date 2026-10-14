import { useEffect, useRef, useSyncExternalStore } from "react";
import { useWindowKey } from "./hooks";
import { Dialog } from "./window";

/** Окно подтверждения/сообщения вместо системных confirm/alert. */
interface DialogRequest {
  id: number;
  title: string;
  text?: string;
  confirmLabel: string;
  cancelLabel: string | null;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

let queue: DialogRequest[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function open(req: Omit<DialogRequest, "id" | "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...req, id: ++seq, resolve }];
    emit();
  });
}

function close(id: number, ok: boolean) {
  const req = queue.find((r) => r.id === id);
  queue = queue.filter((r) => r.id !== id);
  emit();
  req?.resolve(ok);
}

/** Спросить подтверждение. Возвращает true, если нажали основную кнопку. */
export function ask(opts: { title: string; text?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) {
  return open({
    title: opts.title,
    text: opts.text,
    confirmLabel: opts.confirmLabel ?? "Да",
    cancelLabel: opts.cancelLabel ?? "Отмена",
    danger: !!opts.danger,
  });
}

/** Просто сообщить. */
export async function tell(opts: { title: string; text?: string }) {
  await open({ title: opts.title, text: opts.text, confirmLabel: "Понятно", cancelLabel: null, danger: false });
}

/** Место, где показываются окна; монтируется один раз на странице. */
export function DialogHost() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => queue[0],
  );
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (current) primary.current?.focus();
  }, [current]);
  // Enter подтверждает; перехватываем раньше остальных — он относится только к этому окну (Esc — через Dialog)
  useWindowKey(
    (e) => {
      if (!current || e.key !== "Enter") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close(current.id, true);
    },
    { capture: true, enabled: !!current },
  );

  if (!current) return null;
  return (
    <Dialog
      title={current.title}
      role="alertdialog"
      onClose={() => close(current.id, false)}
      actions={
        <>
          {current.cancelLabel && (
            <button className="btn" onClick={() => close(current.id, false)}>
              {current.cancelLabel}
            </button>
          )}
          <button ref={primary} className={`btn ${current.danger ? "btn--danger-solid" : "btn--primary"}`} onClick={() => close(current.id, true)}>
            {current.confirmLabel}
          </button>
        </>
      }
    >
      {current.text?.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
    </Dialog>
  );
}
