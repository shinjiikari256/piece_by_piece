import { useState } from "react";
import { Dialog } from "../../ui/window";
import { Icon } from "../../ui/icons";
import { CounterDialog } from "../sections/Counters";
import { EnumDialog } from "../sections/Enums";
import { FlagDialog } from "./Conditions";

/** Новая переменная: сначала тип (флаг или счётчик), затем окно создания выбранного типа. `onDone` — ключ созданной или `null`. */
export function NewVariableDialog({ onDone }: { onDone: (id: string | null) => void }) {
  const [kind, setKind] = useState<"pick" | "flag" | "counter" | "enum">("pick");
  if (kind === "flag") return <FlagDialog onDone={onDone} />;
  if (kind === "counter") return <CounterDialog onDone={onDone} />;
  if (kind === "enum") return <EnumDialog onDone={onDone} />;
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
          <button className="btn" onClick={() => setKind("enum")}>
            <Icon name="list" size={15} /> Перечисление
          </button>
        </>
      }
    >
      <p className="muted">Тип переменной: флаг — «произошло или нет», счётчик — число, перечисление — одно значение из списка (закрыт / открыт / сломан).</p>
    </Dialog>
  );
}
