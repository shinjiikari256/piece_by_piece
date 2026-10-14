import { slugify } from "transliteration";

/** Английский ключ из русского названия: «Разрешён вход в архив» → razreshyon_vhod_v_arhiv. */
export function toKey(text: string, max = 40): string {
  const key = slugify(text, { lowercase: true, separator: "_", trim: true }).replace(/[^a-z0-9_]+/g, "");
  return key.slice(0, max).replace(/_+$/, "");
}

/** Ключ дела — из номера: «003» → case-003. */
export const caseKey = (number: string) => `case-${toKey(number) || "new"}`;


/** Поля, в которых дело ссылается на другие элементы по ключу. */
const REF_FIELDS = new Set([
  "characterId", "speaker", "responsibleCharacter", "relatedCharacters", "following", "notFollowing", "characters",
  "evidenceId", "evidenceIds", "evidence", "deductions", "relatedEvents", "dialogueId", "to",
  "flag", "flags", "notFlags",
]);

/** Коллекции верхнего уровня, ключи которых переименовываются вместе со ссылками. */
const ENTITY_COLLECTIONS = ["characters", "evidence", "deductions", "events", "locations", "dialogues", "confrontations", "flags"] as const;

/** Это ключ элемента верхнего уровня (а не узла диалога или предмета на карте)? */
export function isEntityKey(d: Record<string, unknown>, key: string): boolean {
  return ENTITY_COLLECTIONS.some((c) => Array.isArray(d[c]) && (d[c] as { id?: string }[]).some((x) => x.id === key));
}

/** Обходит дело и считает/заменяет ссылки на ключ в полях-ссылках. */
function walkRefs(node: unknown, from: string, to: string | null, field = ""): { node: unknown; count: number } {
  let count = 0;
  if (Array.isArray(node)) {
    const out = node.map((x) => {
      if (typeof x === "string" && REF_FIELDS.has(field) && x === from) {
        count++;
        return to ?? x;
      }
      const r = walkRefs(x, from, to, field);
      count += r.count;
      return r.node;
    });
    return { node: out, count };
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && REF_FIELDS.has(k) && v === from) {
        count++;
        out[k] = to ?? v;
        continue;
      }
      const r = walkRefs(v, from, to, k);
      count += r.count;
      out[k] = r.node;
    }
    return { node: out, count };
  }
  return { node, count };
}

type Q = { source?: string; options?: { id: string }[] };
/** Варианты вопросов с источником «персонажи/улики» — это ключи сущностей. */
const questionRefs = (d: Record<string, unknown>, key: string) =>
  ((d.questions as Q[] | undefined) ?? []).filter((q) => q.source !== "inline" && q.options?.some((o) => o.id === key)).length;

/** Сколько раз на ключ ссылаются в деле. */
export const countRefs = (d: Record<string, unknown>, key: string) => walkRefs(d, key, null).count + questionRefs(d, key);

/** Переименовать ключ элемента и все ссылки на него. */
export function renameKey<T extends Record<string, unknown>>(d: T, from: string, to: string): T {
  const renamed = walkRefs(d, from, to).node as T;
  const out: Record<string, unknown> = { ...renamed };
  if (Array.isArray(out.questions))
    out.questions = (out.questions as Q[]).map((q) =>
      q.source === "inline" ? q : { ...q, options: q.options?.map((o) => (o.id === from ? { ...o, id: to } : o)) },
    );
  for (const c of ENTITY_COLLECTIONS) {
    if (Array.isArray(out[c])) out[c] = (out[c] as { id?: string }[]).map((x) => (x.id === from ? { ...x, id: to } : x));
  }
  return out as T;
}
