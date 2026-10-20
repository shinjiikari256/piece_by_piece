import { z } from "zod";
import type { JS } from "./SchemaForm";

/**
 * JSON Schema для форм конструктора. Рекурсивное условие (`Condition`) zod выдаёт ссылкой `$ref`, а генератор форм ссылок не разворачивает,
 * поэтому ссылка заменяется заглушкой «объект»: условия рисует свой редактор (`ConditionEditor`), ему схема не нужна.
 */
export function formSchema(schema: z.ZodType): JS {
  const stub = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(stub);
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.$ref === "string") return { type: "object", properties: {} };
      return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== "$defs").map(([k, v]) => [k, stub(v)]));
    }
    return node;
  };
  return stub(z.toJSONSchema(schema)) as JS;
}
