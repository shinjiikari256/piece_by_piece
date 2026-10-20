import type { Effect, LocationObject, ObjectState } from "./case";
import { meets, type Progress } from "./conditions";

/** Действующее состояние предмета: первое по порядку, чьё условие выполнено; `null` — вид по умолчанию. */
export function activeState(o: Pick<LocationObject, "states">, p: Progress, locationId?: string): ObjectState | null {
  return o.states?.find((st) => meets(st.when, p, locationId)) ?? null;
}

/** Предмет глазами игрока в данный момент: поля состояния заменяют поля предмета, если заданы. */
export interface ObjectView {
  state: ObjectState | null;
  label: string;
  interaction: LocationObject["interaction"];
  onInteract: Effect[];
  /** Есть что осматривать: окно или эффекты. */
  interactive: boolean;
}

export function objectView(o: Pick<LocationObject, "states" | "interaction" | "onInteract" | "label">, p: Progress, locationId?: string): ObjectView {
  const state = activeState(o, p, locationId);
  const interaction = state?.interaction !== undefined ? state.interaction : o.interaction;
  const onInteract = state?.onInteract ?? o.onInteract ?? [];
  return { state, label: state?.label ?? o.label, interaction, onInteract, interactive: !!interaction || onInteract.length > 0 };
}

/** Окно осмотра с учётом состояния. */
export const currentInteraction = (o: Parameters<typeof objectView>[0], p: Progress, locationId?: string): LocationObject["interaction"] => objectView(o, p, locationId).interaction;
