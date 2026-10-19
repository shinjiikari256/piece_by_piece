import { useState } from "react";
import { Dialog } from "../../ui/window";
import { Icon } from "../../ui/icons";
import { CounterDialog } from "../sections/Counters";
import { FlagDialog } from "./Conditions";

/** Новая переменная: сначала тип (флаг или счётчик), затем окно создания выбранного типа. `onDone` — ключ созданной или `null`. */
export function NewVariableDialog({ onDone }: { onDone: (id: string | null) => void }) {
  const [kind, setKind] = useState<"pick" | "flag" | "counter">("pick");
  if (kind === "flag") return <FlagDialog onDone={onDone} />;
  if (kind === "counter") return <CounterDialog onDone={onDone} />;
  return (
    <Dialog
      title="Новая переменная"
      onClose={() => onDone(null)}
      actions={
        <>
          <button className="btn" onClick={() => setKind("flag")}>
            <Icon name="flag" size={15} /> Флаг
          </button>
          <button className="btn" onClick={() => setKind("counter")}>
            <Icon name="counter" size={15} /> Счётчик
          </button>
        </>
      }
    >
      <p className="muted">Тип переменной: флаг — «произошло или нет», счётчик — число.</p>
    </Dialog>
  );
}
