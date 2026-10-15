import { z } from "zod";
import { CaseFile } from "../../../../shared/case";
import { type JS } from "./SchemaForm";

/** Команды списка, открытого сейчас (для контекстного меню элементов). */
export const listActions: {
  current: { count: number; copy: (i: number) => void; move: (i: number, d: -1 | 1) => void; remove: (i: number) => void } | null;
} = { current: null };

/** Заголовок элемента списка без id (id — отдельной строкой). */
export function itemHeading(item: unknown, i: number): string {
  const o = (item ?? {}) as Record<string, unknown>;
  const main = o.title ?? o.name ?? o.text ?? o.label ?? o.prompt ?? o.question;
  if (typeof main === "string" && main) return main.length > 60 ? main.slice(0, 60) + "…" : main;
  if (typeof o.time === "string") return String(o.time);
  if (typeof o.level === "number") return `Подсказка ${o.level}`;
  return typeof o.id === "string" ? o.id : `#${i + 1}`;
}

export const SCHEMA: JS = z.toJSONSchema(CaseFile);
