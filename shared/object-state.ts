import type { LocationObject, ObjectState } from "./case";
import { meets, type Progress } from "./conditions";

/** Действующее состояние предмета: первое по порядку, чьё условие выполнено; `null` — вид по умолчанию. */
export function activeState(o: Pick<LocationObject, "states">, p: Progress, locationId?: string): ObjectState | null {
  return o.states?.find((st) => meets(st.when, p, locationId)) ?? null;
}

/** Осмотр предмета с учётом состояния: окно переопределяет состояние (`undefined` — как у предмета). */
export function currentInteraction(o: Pick<LocationObject, "states" | "interaction">, p: Progress, locationId?: string): LocationObject["interaction"] {
  const st = activeState(o, p, locationId);
  return st?.interaction !== undefined ? st.interaction : o.interaction;
}
