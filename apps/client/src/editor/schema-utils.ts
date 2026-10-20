import { ENUM_LABELS } from "./labels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JS = any;

export const isNullable = (s: JS) =>
  (Array.isArray(s.type) && s.type.includes("null")) || (Array.isArray(s.anyOf) && s.anyOf.some((x: JS) => x.type === "null"));

export const nonNull = (s: JS): JS => {
  if (Array.isArray(s.type)) return { ...s, type: s.type.find((t: string) => t !== "null") };
  if (Array.isArray(s.anyOf)) return { ...s.anyOf.find((x: JS) => x.type !== "null"), description: s.description };
  return s;
};

export const discriminatorOf = (variants: JS[]) =>
  Object.keys(variants[0]?.properties ?? {}).find((k) => variants.every((v: JS) => v.properties?.[k]?.const !== undefined));

/** Пустое значение необязательного поля: его не пишем в дело. */
export function isBlank(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(isBlank);
  return false;
}

export function defaultFor(s: JS): unknown {
  if (isNullable(s)) return null;
  if (s.oneOf) return defaultFor(s.oneOf[0]);
  if (s.const !== undefined) return s.const;
  if (s.enum) return s.enum[0];
  switch (s.type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const key of s.required ?? []) out[key] = defaultFor(s.properties[key]);
      return out;
    }
    case "array":
      return [];
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

export function itemTitle(item: unknown, index: number): string {
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    // эффекты: «поставить флаг: x», «добавить улику в дело: e1»
    if (typeof o.type === "string" && ENUM_LABELS[o.type]) {
      const arg = o.flag ?? o.evidenceId ?? o.characterId;
      return arg ? `${ENUM_LABELS[o.type]}: ${String(arg)}` : ENUM_LABELS[o.type];
    }
    const main = o.title ?? o.name ?? o.text ?? o.label ?? o.prompt ?? o.question;
    const id = o.id ?? o.evidenceId ?? o.characterId;
    const head = typeof main === "string" && main ? main.slice(0, 50) : "";
    if (id && head) return `${head} · ${id}`;
    if (id) return String(id);
    if (head) return head;
    if (o.type) return String(o.type);
  }
  if (typeof item === "string") return item || "(пусто)";
  return `#${index + 1}`;
}
